import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

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

function WikidataMetadataView({ metadata }: { metadata: import('./types').PhysicalObjectMetadataRecord | null }) {
  return (
    <DefaultMetadataView metadata={metadata}>
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
    </DefaultMetadataView>
  );
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
  mapToHdtOntology: (m) => defaultMapToHdtOntology(m, 'wikidata', ['Mapping is generated from cached Dublin Core fields extracted from Wikidata EntityData.']),
};
