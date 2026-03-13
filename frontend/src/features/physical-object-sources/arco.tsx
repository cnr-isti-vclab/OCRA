import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

const DEFAULT_ARCO_CATALOG_ID = '0901078520';
const DEFAULT_ARCO_RESOURCE_BASE =
  'https://dati.cultura.gov.it/resource/HistoricOrArtisticProperty';
const DEFAULT_ARCO_LODVIEW_BASE =
  'https://dati.cultura.gov.it/lodview-arco/resource/HistoricOrArtisticProperty';

export interface ArcoFormState {
  catalogId: string;
  endpoint: string;
}

function readCatalogId(state: ArcoFormState | null | undefined): string {
  return typeof state?.catalogId === 'string' ? state.catalogId : '';
}

function readEndpoint(state: ArcoFormState | null | undefined): string {
  return typeof state?.endpoint === 'string' ? state.endpoint : '';
}

function buildArcoEndpoint(catalogId: string): string {
  return `${DEFAULT_ARCO_LODVIEW_BASE}/${encodeURIComponent(catalogId)}.html?output=application%2Fld%2Bjson`;
}

function ArcoImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<ArcoFormState>) {
  const catalogIdValue = readCatalogId(state);
  const endpointValue = readEndpoint(state);
  const resolvedCatalogId = catalogIdValue.trim() || DEFAULT_ARCO_CATALOG_ID;

  return (
    <div className="border rounded p-3 bg-light">
      <h6 className="mb-3">ARCO Import Parameters</h6>
      <div className="mb-3">
        <label htmlFor="arco-catalog-id" className="form-label">
          ARCO Catalog ID
        </label>
        <input
          id="arco-catalog-id"
          type="text"
          className="form-control"
          value={catalogIdValue}
          onChange={(e) => onChange({ ...state, catalogId: e.target.value })}
          disabled={disabled}
          placeholder="e.g. 0901234567"
        />
        <small className="form-text text-muted">
          Numeric catalog identifier from ARCO, for example <code>{DEFAULT_ARCO_CATALOG_ID}</code>.
        </small>
      </div>

      <div className="mb-2">
        <small className="text-muted d-block">Resolved source URI</small>
        <code className="text-break">
          {`${DEFAULT_ARCO_RESOURCE_BASE}/${encodeURIComponent(resolvedCatalogId)}`}
        </code>
      </div>

      <div>
        <small className="text-muted d-block">Resolved endpoint (JSON-LD)</small>
        <code className="text-break">{endpointValue.trim() || buildArcoEndpoint(resolvedCatalogId)}</code>
      </div>

      <div className="mt-3">
        <label htmlFor="arco-endpoint-override" className="form-label">
          Endpoint Override (optional)
        </label>
        <input
          id="arco-endpoint-override"
          type="url"
          className="form-control"
          value={endpointValue}
          onChange={(e) => onChange({ ...state, endpoint: e.target.value })}
          disabled={disabled}
          placeholder={buildArcoEndpoint(DEFAULT_ARCO_CATALOG_ID)}
        />
        <small className="form-text text-muted">
          Leave empty to use the default ARCO lodview endpoint.
        </small>
      </div>
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
  description: 'Import HC1 metadata from ARCO catalog JSON-LD records.',
  status: 'available',
  createInitialState: () => ({
    catalogId: DEFAULT_ARCO_CATALOG_ID,
    endpoint: '',
  }),
  ImportForm: ArcoImportForm,
  buildImportRequest: (_projectId: string, state: ArcoFormState) => {
    const id = readCatalogId(state).trim() || DEFAULT_ARCO_CATALOG_ID;
    const endpoint = readEndpoint(state).trim() || buildArcoEndpoint(id);
    const sourceUri = `${DEFAULT_ARCO_RESOURCE_BASE}/${encodeURIComponent(id)}`;

    return {
      sourceType: 'arco',
      sourceUri,
      payload: {
        catalogId: id,
        endpoint,
      },
    };
  },
  MetadataView: ArcoMetadataView,
  mapToHdtOntology: (m) => defaultMapToHdtOntology(m, 'arco', ['Mapping is generated from cached Dublin Core fields extracted from ARCO JSON-LD records.']),
};
