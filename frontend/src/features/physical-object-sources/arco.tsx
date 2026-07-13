import { useState } from 'react';
import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';
import ArcoBrowser, { type ArcoBrowserSelection } from '../../components/arco/ArcoBrowser';

export interface ArcoFormState {
  selectedUri: string;
  selectedTitle: string;
  catalogId: string;
}

function extractCatalogId(uri: string): string {
  return uri.split('/').pop() || '';
}

function ArcoImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<ArcoFormState>) {
  const [selection, setSelection] = useState<ArcoBrowserSelection | null>(
    state?.selectedUri ? { result: { uri: state.selectedUri, title: state?.selectedTitle || null, identifier: extractCatalogId(state.selectedUri), coverage: null } } : null
  );

  function handleSelectionChange(sel: ArcoBrowserSelection | null): void {
    setSelection(sel);
    if (!sel) {
      onChange({ ...state, selectedUri: '', selectedTitle: '', catalogId: '' });
      return;
    }
    const catalogId = extractCatalogId(sel.result.uri);
    onChange({
      ...state,
      selectedUri: sel.result.uri,
      selectedTitle: sel.result.title || '',
      catalogId,
    });
  }

  return (
    <div>
      <ArcoBrowser
        disabled={disabled}
        onSelectionChange={handleSelectionChange}
      />
      {state?.selectedUri && (
        <div className="alert alert-success mt-3 py-2 small mb-0">
          <strong>Selected:</strong>{' '}
          <span className="text-break">{state.selectedTitle || state.selectedUri}</span>
          <div className="text-muted mt-1 text-break">{state.selectedUri}</div>
        </div>
      )}
    </div>
  );
}

function ArcoMetadataView({ metadata }: { metadata: import('./types').PhysicalObjectMetadataRecord | null }) {
  return (
    <DefaultMetadataView metadata={metadata}>
      <h6 className="mb-2">Import Record</h6>
      <ul className="list-group list-group-flush border rounded">
        <li className="list-group-item d-flex justify-content-between">
          <span>Catalog ID</span>
          <span>{getSourceRecordField(metadata, 'catalogId') || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Endpoint</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'endpoint') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Record ID</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'recordId') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Imported At</span>
          <span>{getSourceRecordField(metadata, 'importedAt') || '-'}</span>
        </li>
      </ul>
    </DefaultMetadataView>
  );
}

export const arcoSourceAdapter: PhysicalObjectSourceAdapter<ArcoFormState> = {
  sourceType: 'arco',
  label: 'ARCO Catalog',
  description: 'Search the ARCO catalog and import Heritage Entity metadata for the selected heritage entity.',
  status: 'available',
  createInitialState: () => ({
    selectedUri: '',
    selectedTitle: '',
    catalogId: '',
  }),
  ImportForm: ArcoImportForm,
  buildImportRequest: (_projectId: string, state: ArcoFormState) => {
    const catalogId = state.catalogId || extractCatalogId(state.selectedUri);
    return {
      sourceType: 'arco',
      sourceUri: state.selectedUri,
      payload: { catalogId },
    };
  },
  MetadataView: ArcoMetadataView,
  mapToHdtOntology: (m) => defaultMapToHdtOntology(m, 'arco', ['Mapping generated from Dublin Core fields extracted from ARCO JSON-LD records.']),
};
