import type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';

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

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => asText(entry)).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['@value'] === 'string') return record['@value'];
    if (typeof record['@id'] === 'string') return record['@id'];
  }
  return '';
}

function getDublinCoreField(metadata: PhysicalObjectMetadataRecord | null, key: string): string {
  const dublinCore = metadata?.dublinCore as Record<string, unknown> | undefined;
  return asText(dublinCore?.[key]);
}

function getSourceRecordField(metadata: PhysicalObjectMetadataRecord | null, key: string): string {
  const sourceRecord = metadata?.sourceRecord as Record<string, unknown> | undefined;
  return asText(sourceRecord?.[key]);
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

function ArcoMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  if (!metadata) {
    return <div className="text-muted">No imported metadata available.</div>;
  }

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="text-muted small">Source Type</div>
            <div className="fw-semibold">{asString(metadata.sourceType) || 'arco'}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="text-muted small">Source URI</div>
            <code className="text-break">{asString(metadata.sourceUri) || '-'}</code>
          </div>
        </div>
      </div>

      <h6 className="mb-2">Dublin Core (Read-only)</h6>
      <div className="table-responsive mb-3">
        <table className="table table-sm align-middle">
          <tbody>
            <tr><th>Title</th><td>{getDublinCoreField(metadata, 'title') || '-'}</td></tr>
            <tr><th>Description</th><td>{getDublinCoreField(metadata, 'description') || '-'}</td></tr>
            <tr><th>Creator</th><td>{getDublinCoreField(metadata, 'creator') || '-'}</td></tr>
            <tr><th>Subject</th><td>{getDublinCoreField(metadata, 'subject') || '-'}</td></tr>
            <tr><th>Date</th><td>{getDublinCoreField(metadata, 'date') || '-'}</td></tr>
            <tr><th>Type</th><td>{getDublinCoreField(metadata, 'type') || '-'}</td></tr>
            <tr><th>Identifier</th><td>{getDublinCoreField(metadata, 'identifier') || '-'}</td></tr>
            <tr><th>Coverage</th><td>{getDublinCoreField(metadata, 'coverage') || '-'}</td></tr>
            <tr><th>Rights</th><td>{getDublinCoreField(metadata, 'rights') || '-'}</td></tr>
            <tr><th>Source</th><td>{getDublinCoreField(metadata, 'source') || '-'}</td></tr>
          </tbody>
        </table>
      </div>

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

      <div className="border rounded p-3 bg-light mt-3">
        <small className="text-muted d-block mb-2">Raw metadata (debug)</small>
        <pre className="mb-0 small">{JSON.stringify(metadata, null, 2)}</pre>
      </div>
    </div>
  );
}

function mapArcoToHdtOntology(metadata: PhysicalObjectMetadataRecord | null): OntologyMappingResult {
  const pushTriple = (triples: OntologyMappingResult['triples'], predicate: string, value: string) => {
    if (value) {
      triples.push({ predicate, value });
    }
  };

  const triples: OntologyMappingResult['triples'] = [];

  pushTriple(triples, 'rdf:type', 'hdt:HC1');
  pushTriple(triples, 'dc:title', getDublinCoreField(metadata, 'title'));
  pushTriple(triples, 'dc:description', getDublinCoreField(metadata, 'description'));
  pushTriple(triples, 'dc:creator', getDublinCoreField(metadata, 'creator'));
  pushTriple(triples, 'dc:subject', getDublinCoreField(metadata, 'subject'));
  pushTriple(triples, 'dc:date', getDublinCoreField(metadata, 'date'));
  pushTriple(triples, 'dc:type', getDublinCoreField(metadata, 'type'));
  pushTriple(triples, 'dc:identifier', getDublinCoreField(metadata, 'identifier'));
  pushTriple(triples, 'dc:source', getDublinCoreField(metadata, 'source') || asString(metadata?.sourceUri));
  pushTriple(triples, 'dc:coverage', getDublinCoreField(metadata, 'coverage'));
  pushTriple(triples, 'dc:rights', getDublinCoreField(metadata, 'rights'));

  return {
    classId: 'HC1',
    sourceType: 'arco',
    triples,
    notes: [
      'Mapping is generated from cached Dublin Core fields extracted from ARCO JSON-LD records.',
    ],
  };
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
  mapToHdtOntology: mapArcoToHdtOntology,
};
