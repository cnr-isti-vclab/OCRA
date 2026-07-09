import EuropeanaBrowser, { type EuropeanaBrowserSelection } from '../../components/europeana/EuropeanaBrowser';
import { createRemoteModelAsset, importRemoteAssetIntoHdt, updateHdtAsset } from '../../services/HdtAssetApi';
import type {
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

export interface EuropeanaFormState {
  selectedUri: string;
  selectedTitle: string;
  detail: EuropeanaBrowserSelection['detail'];
  import3dAsset: boolean;
}

function EuropeanaImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<EuropeanaFormState>) {
  function handleSelectionChange(nextSelection: EuropeanaBrowserSelection | null): void {
    if (!nextSelection) {
      onChange({
        ...state,
        selectedUri: '',
        selectedTitle: '',
        detail: null,
        import3dAsset: false,
      });
      return;
    }

    onChange({
      ...state,
      selectedUri: nextSelection.result.uri,
      selectedTitle: nextSelection.result.title || '',
      detail: nextSelection.detail,
      import3dAsset: Boolean(nextSelection.detail?.mediaUrl),
    });
  }

  const mediaAvailable = Boolean(state.detail?.mediaUrl);

  return (
    <div>
      <EuropeanaBrowser
        disabled={disabled}
        onSelectionChange={handleSelectionChange}
      />
      {state.selectedUri && (
        <div className="alert alert-success mt-3 py-2 small mb-0">
          <strong>Selected:</strong>{' '}
          <span className="text-break">{state.selectedTitle || state.selectedUri}</span>
          <div className="text-muted mt-1 text-break">{state.selectedUri}</div>
        </div>
      )}
      {state.detail && (
        <div className="form-check mt-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="europeanaImport3dAsset"
            checked={state.import3dAsset}
            disabled={disabled || !mediaAvailable}
            onChange={(e) => onChange({ ...state, import3dAsset: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="europeanaImport3dAsset">
            Import the linked 3D `.glb` as an OCRA asset
          </label>
          <div className="form-text">
            {mediaAvailable
              ? 'OCRA will try to download the remote GLB on the backend after the metadata import.'
              : 'This Europeana record does not currently expose an importable GLB URL.'}
          </div>
        </div>
      )}
    </div>
  );
}

function EuropeanaMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  return (
    <DefaultMetadataView metadata={metadata}>
      <h6 className="mb-2">Import Record</h6>
      <ul className="list-group list-group-flush border rounded">
        <li className="list-group-item d-flex justify-content-between">
          <span>Europeana URI</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'choUri') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>3D media URL</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'mediaUrl') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>License</span>
          <span className="text-break text-end">{getSourceRecordField(metadata, 'license') || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Provider</span>
          <span className="text-break text-end">{getSourceRecordField(metadata, 'provider') || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Imported At</span>
          <span>{getSourceRecordField(metadata, 'importedAt') || '-'}</span>
        </li>
      </ul>
    </DefaultMetadataView>
  );
}

function buildEuropeanaDublinCore(detail: NonNullable<EuropeanaFormState['detail']>) {
  return {
    title: detail.title || undefined,
    description: detail.description || undefined,
    creator: detail.creator || undefined,
    date: detail.date || undefined,
    identifier: detail.identifier || detail.uri,
    coverage: detail.coverage || undefined,
    type: detail.type || '3D',
    rights: detail.license || undefined,
    source: detail.uri,
  };
}

async function importEuropeana3dAsset(
  projectId: string,
  state: EuropeanaFormState
): Promise<string | null> {
  if (!state.import3dAsset || !state.detail?.mediaUrl) {
    return null;
  }

  const detail = state.detail;
  const assetTitle = detail.title || state.selectedTitle || 'Europeana 3D asset';
  const assetLabel = assetTitle;

  const assetId = await createRemoteModelAsset(projectId, {
    label: assetLabel,
    title: assetTitle,
    description: detail.description || undefined,
    metadata: {
      sourceUrl: detail.mediaUrl,
      linkedHeritageEntityUri: detail.uri,
      rights: detail.license,
      provider: detail.provider,
      dataProvider: detail.dataProvider,
    },
  });

  const imported = await importRemoteAssetIntoHdt(projectId, assetId, detail.mediaUrl);
  const resolvedSourceUrl = imported.sourceUrl || detail.mediaUrl;
  await updateHdtAsset(projectId, assetId, {
    type: '3d-model',
    fileName: imported.fileName || 'europeana-model.glb',
    entrySize: imported.entrySize,
    entryPointUrl: imported.entryPointUrl,
    entryPoint: imported.entryPoint,
    mimeType: imported.mimeType || 'model/gltf-binary',
    uploadedAt: new Date().toISOString(),
    metadata: imported.metadata ?? {
      sourceUrl: resolvedSourceUrl,
      linkedHeritageEntityUri: detail.uri,
    },
  });

  return resolvedSourceUrl;
}

export const europeanaSourceAdapter: PhysicalObjectSourceAdapter<EuropeanaFormState> = {
  sourceType: 'europeana',
  label: 'Europeana',
  description: 'Search Europeana 3D records and import Heritage Entity metadata from the selected record.',
  status: 'available',
  createInitialState: () => ({
    selectedUri: '',
    selectedTitle: '',
    detail: null,
    import3dAsset: false,
  }),
  ImportForm: EuropeanaImportForm,
  buildImportRequest: (_projectId: string, state: EuropeanaFormState) => {
    if (!state.selectedUri || !state.detail) {
      throw new Error('Select a Europeana record before importing.');
    }

    return {
      sourceType: 'europeana',
      sourceUri: state.selectedUri,
      payload: {
        choUri: state.selectedUri,
        mediaUrl: state.detail.mediaUrl,
        license: state.detail.license,
        provider: state.detail.provider,
        dataProvider: state.detail.dataProvider,
        thumbnailUrl: state.detail.thumbnailUrl,
        dublinCore: buildEuropeanaDublinCore(state.detail),
      },
    };
  },
  afterImport: async ({ projectId, state }) => {
    try {
      const importedMediaUrl = await importEuropeana3dAsset(projectId, state);
      if (!importedMediaUrl) {
        return undefined;
      }

      return {
        successMessage: 'The linked Europeana 3D model was also imported as an OCRA asset.',
      };
    } catch (error) {
      return {
        warningMessage:
          error instanceof Error
            ? `Metadata imported successfully, but the linked 3D asset could not be loaded: ${error.message}`
            : 'Metadata imported successfully, but the linked 3D asset could not be loaded.',
      };
    }
  },
  MetadataView: EuropeanaMetadataView,
  mapToHdtOntology: (metadata) =>
    defaultMapToHdtOntology(metadata, 'europeana', [
      'Mapping is generated from Dublin Core fields extracted from the selected Europeana 3D record.',
    ]),
};
