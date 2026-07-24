import WikidataBrowser, { type WikidataBrowserSelection } from '../../components/wikidata/WikidataBrowser';
import { createRemoteAsset, importRemoteAssetIntoHdt, updateHdtAsset } from '../../services/HdtAssetApi';
import type {
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

const DEFAULT_WIKIDATA_LANGUAGES = 'it,en';

export interface WikidataFormState {
  selectedQid: string;
  selectedUri: string;
  selectedTitle: string;
  detail: WikidataBrowserSelection['detail'];
  languages: string;
  importImageAsset: boolean;
}

function readLanguages(state: WikidataFormState | null | undefined): string {
  return typeof state?.languages === 'string' ? state.languages : DEFAULT_WIKIDATA_LANGUAGES;
}

function preferredLanguage(state: WikidataFormState): string {
  return readLanguages(state).split(/[\s,|]+/).map((value) => value.trim().toLowerCase()).find(Boolean) || 'it';
}

function WikidataImportForm({ state, onChange, disabled }: PhysicalObjectSourceFormProps<WikidataFormState>) {
  const image = state.detail?.image;
  const imageCanBeImported = Boolean(image?.originalUrl && image.license);

  function handleSelectionChange(selection: WikidataBrowserSelection | null): void {
    if (!selection) {
      onChange({ ...state, selectedQid: '', selectedUri: '', selectedTitle: '', detail: null, importImageAsset: false });
      return;
    }
    onChange({
      ...state,
      selectedQid: selection.result.qid,
      selectedUri: selection.result.uri,
      selectedTitle: selection.result.title || '',
      detail: selection.detail,
      importImageAsset: Boolean(selection.detail?.image?.originalUrl && selection.detail.image.license),
    });
  }

  return <div>
    <div className="mb-3">
      <label htmlFor="wikidata-languages" className="form-label">Preferred languages</label>
      <input id="wikidata-languages" type="text" className="form-control" value={readLanguages(state)} onChange={(event) => onChange({ ...state, languages: event.target.value })} disabled={disabled} />
      <small className="form-text text-muted">Comma-separated codes used for labels and descriptions.</small>
    </div>
    <WikidataBrowser disabled={disabled} language={preferredLanguage(state)} onSelectionChange={handleSelectionChange} />
    {state.selectedUri && <div className="alert alert-success mt-3 py-2 small mb-0"><strong>Selected:</strong> <span className="text-break">{state.selectedTitle || state.selectedQid}</span><div className="text-muted mt-1 text-break">{state.selectedUri}</div></div>}
    {state.detail && <div className="form-check mt-3">
      <input className="form-check-input" type="checkbox" id="wikidataImportImageAsset" checked={state.importImageAsset} disabled={disabled || !imageCanBeImported} onChange={(event) => onChange({ ...state, importImageAsset: event.target.checked })} />
      <label className="form-check-label" htmlFor="wikidataImportImageAsset">Add the linked Wikimedia Commons image as an OCRA asset</label>
      <div className="form-text">
        {imageCanBeImported ? <>
          The original image will be imported from its permanent Commons URI under <strong>{image!.license}</strong>{image!.licenseUrl && <> (<a href={image!.licenseUrl} target="_blank" rel="noreferrer">license terms</a>)</>}. Verify that your intended use complies with the license and attribution requirements.
        </> : image?.originalUrl ? 'The linked image has no resolvable license metadata and cannot be added automatically.' : 'This Wikidata record does not expose an image with a permanent Commons URI.'}
      </div>
    </div>}
  </div>;
}

function WikidataMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  return <DefaultMetadataView metadata={metadata}>
    <h6 className="mb-2">Import Record</h6>
    <ul className="list-group list-group-flush border rounded">
      <li className="list-group-item d-flex justify-content-between"><span>QID</span><span>{getSourceRecordField(metadata, 'qid') || '-'}</span></li>
      <li className="list-group-item d-flex justify-content-between"><span>Canonical URI</span><code className="text-break text-end">{getSourceRecordField(metadata, 'canonicalSourceUri') || '-'}</code></li>
      <li className="list-group-item d-flex justify-content-between"><span>Imported At</span><span>{getSourceRecordField(metadata, 'importedAt') || '-'}</span></li>
    </ul>
  </DefaultMetadataView>;
}

async function importWikidataImageAsset(projectId: string, state: WikidataFormState): Promise<string | null> {
  const image = state.detail?.image;
  if (!state.importImageAsset || !image?.originalUrl || !image.license) return null;
  const title = state.detail?.title || state.selectedTitle || 'Wikimedia Commons image';
  const assetId = await createRemoteAsset(projectId, {
    type: 'image',
    label: title,
    title,
    description: state.detail?.description || undefined,
    metadata: {
      sourceUrl: image.originalUrl,
      sourceAssetUri: image.filePageUrl,
      linkedHeritageEntityUri: state.selectedUri,
      rights: image.license,
      licenseUrl: image.licenseUrl,
      attribution: image.attribution,
    },
  });
  const imported = await importRemoteAssetIntoHdt(projectId, assetId, image.originalUrl);
  await updateHdtAsset(projectId, assetId, {
    type: 'image',
    fileName: imported.fileName || image.fileName,
    entrySize: imported.entrySize,
    entryPointUrl: imported.entryPointUrl,
    entryPoint: imported.entryPoint,
    mimeType: imported.mimeType || image.mimeType,
    uploadedAt: new Date().toISOString(),
    metadata: {
      ...(imported.metadata ?? {}),
      sourceUrl: imported.sourceUrl || image.originalUrl,
      sourceAssetUri: image.filePageUrl,
      linkedHeritageEntityUri: state.selectedUri,
      rights: image.license,
      licenseUrl: image.licenseUrl,
      attribution: image.attribution,
    },
  });
  return imported.sourceUrl || image.originalUrl;
}

export const wikidataSourceAdapter: PhysicalObjectSourceAdapter<WikidataFormState> = {
  sourceType: 'wikidata',
  label: 'Wikidata',
  description: 'Search Wikidata entities and import Heritage Entity metadata from the selected record.',
  status: 'available',
  createInitialState: () => ({ selectedQid: '', selectedUri: '', selectedTitle: '', detail: null, languages: DEFAULT_WIKIDATA_LANGUAGES, importImageAsset: false }),
  ImportForm: WikidataImportForm,
  buildImportRequest: (_projectId, state) => {
    if (!state.selectedQid || !state.selectedUri) throw new Error('Select a Wikidata record before importing.');
    const languages = readLanguages(state).split(/[\s,|]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    return { sourceType: 'wikidata', sourceUri: state.selectedUri, payload: { qid: state.selectedQid, language: languages[0] || 'it', languages } };
  },
  afterImport: async ({ projectId, state }) => {
    try {
      const importedImageUrl = await importWikidataImageAsset(projectId, state);
      return importedImageUrl ? { successMessage: 'The linked Wikimedia Commons image was also imported as an OCRA asset.' } : undefined;
    } catch (error) {
      return { warningMessage: error instanceof Error ? `Metadata imported successfully, but the linked image could not be loaded: ${error.message}` : 'Metadata imported successfully, but the linked image could not be loaded.' };
    }
  },
  MetadataView: WikidataMetadataView,
  mapToHdtOntology: (metadata) => defaultMapToHdtOntology(metadata, 'wikidata', ['Mapping is generated from Dublin Core fields extracted from Wikidata EntityData.']),
};
