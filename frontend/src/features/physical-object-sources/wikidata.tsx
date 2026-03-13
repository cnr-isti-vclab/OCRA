import type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';

const DEFAULT_WIKIDATA_SOURCE = 'https://reasonator.toolforge.org/?q=Q24628970';
const DEFAULT_WIKIDATA_LANGUAGES = 'it,en';

export interface WikidataFormState {
  source: string;
  languages: string;
}

function readSource(state: WikidataFormState | null | undefined): string {
  return typeof state?.source === 'string' ? state.source : '';
}

function readLanguages(state: WikidataFormState | null | undefined): string {
  return typeof state?.languages === 'string' ? state.languages : '';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => asText(entry)).filter(Boolean).join(', ');
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['@value'] === 'string') return record['@value'];
    if (typeof record.value === 'string') return record.value;
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

function WikidataImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<WikidataFormState>) {
  const source = readSource(state);
  const languages = readLanguages(state);

  return (
    <div className="border rounded p-3 bg-light">
      <h6 className="mb-3">Wikidata Import Parameters</h6>

      <div className="mb-3">
        <label htmlFor="wikidata-source" className="form-label">
          Source (QID or URL)
        </label>
        <input
          id="wikidata-source"
          type="text"
          className="form-control"
          value={source}
          onChange={(e) => onChange({ ...state, source: e.target.value })}
          disabled={disabled}
          placeholder={DEFAULT_WIKIDATA_SOURCE}
        />
        <small className="form-text text-muted">
          Accepted formats: QID, Wikidata entity URL, or Reasonator URL.
        </small>
      </div>

      <div>
        <label htmlFor="wikidata-languages" className="form-label">
          Preferred languages
        </label>
        <input
          id="wikidata-languages"
          type="text"
          className="form-control"
          value={languages}
          onChange={(e) => onChange({ ...state, languages: e.target.value })}
          disabled={disabled}
          placeholder={DEFAULT_WIKIDATA_LANGUAGES}
        />
        <small className="form-text text-muted">
          Comma-separated language codes used for labels and descriptions.
        </small>
      </div>
    </div>
  );
}

function WikidataMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  if (!metadata) {
    return <div className="text-muted">No imported metadata available.</div>;
  }

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="text-muted small">Source Type</div>
            <div className="fw-semibold">{asString(metadata.sourceType) || 'wikidata'}</div>
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
          <span>QID</span>
          <span>{getSourceRecordField(metadata, 'qid') || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Canonical URI</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'canonicalSourceUri') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Reasonator URI</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'reasonatorUri') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Imported At</span>
          <span>{getSourceRecordField(metadata, 'importedAt') || '-'}</span>
        </li>
      </ul>
    </div>
  );
}

function mapWikidataToHdtOntology(metadata: PhysicalObjectMetadataRecord | null): OntologyMappingResult {
  const triples: OntologyMappingResult['triples'] = [];

  const pushTriple = (predicate: string, value: string) => {
    if (value) {
      triples.push({ predicate, value });
    }
  };

  pushTriple('rdf:type', 'hdt:HC1');
  pushTriple('dc:title', getDublinCoreField(metadata, 'title'));
  pushTriple('dc:description', getDublinCoreField(metadata, 'description'));
  pushTriple('dc:creator', getDublinCoreField(metadata, 'creator'));
  pushTriple('dc:subject', getDublinCoreField(metadata, 'subject'));
  pushTriple('dc:date', getDublinCoreField(metadata, 'date'));
  pushTriple('dc:type', getDublinCoreField(metadata, 'type'));
  pushTriple('dc:identifier', getDublinCoreField(metadata, 'identifier'));
  pushTriple('dc:coverage', getDublinCoreField(metadata, 'coverage'));
  pushTriple('dc:rights', getDublinCoreField(metadata, 'rights'));
  pushTriple('dc:source', getDublinCoreField(metadata, 'source') || asString(metadata?.sourceUri));

  return {
    classId: 'HC1',
    sourceType: 'wikidata',
    triples,
    notes: ['Mapping is generated from cached Dublin Core fields extracted from Wikidata EntityData.'],
  };
}

export const wikidataSourceAdapter: PhysicalObjectSourceAdapter<WikidataFormState> = {
  sourceType: 'wikidata',
  label: 'Wikidata',
  description: 'Import HC1 metadata from Wikidata entities (Reasonator-compatible).',
  status: 'available',
  createInitialState: () => ({
    source: DEFAULT_WIKIDATA_SOURCE,
    languages: DEFAULT_WIKIDATA_LANGUAGES,
  }),
  ImportForm: WikidataImportForm,
  buildImportRequest: (_projectId: string, state: WikidataFormState) => {
    const sourceUri = readSource(state).trim() || DEFAULT_WIKIDATA_SOURCE;
    const languages = readLanguages(state)
      .split(/[\s,|]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return {
      sourceType: 'wikidata',
      sourceUri,
      payload: {
        language: languages[0] || 'it',
        languages,
      },
    };
  },
  MetadataView: WikidataMetadataView,
  mapToHdtOntology: mapWikidataToHdtOntology,
};
