import type {
  OntologyMappingResult,
  PhysicalObjectMetadataRecord,
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';

export interface ArcoFormState {
  catalogId: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function ArcoImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<ArcoFormState>) {
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
          value={state.catalogId}
          onChange={(e) => onChange({ ...state, catalogId: e.target.value })}
          disabled={disabled}
          placeholder="e.g. 0901234567"
        />
        <small className="form-text text-muted">
          Placeholder input: ARCO import functions are scaffolded but not implemented yet.
        </small>
      </div>
      <div className="alert alert-warning mb-0 small">
        ARCO source adapter is currently a placeholder. Import requests will return "not implemented".
      </div>
    </div>
  );
}

function ArcoMetadataView({ metadata }: { metadata: PhysicalObjectMetadataRecord | null }) {
  return (
    <div>
      <p className="text-muted mb-3">
        ARCO metadata renderer placeholder. Imported payload will be displayed once ARCO fetching is implemented.
      </p>
      <div className="border rounded p-3 bg-light">
        <pre className="mb-0 small">{JSON.stringify(metadata, null, 2)}</pre>
      </div>
    </div>
  );
}

function mapArcoToHdtOntology(metadata: PhysicalObjectMetadataRecord | null): OntologyMappingResult {
  return {
    classId: 'HC1',
    sourceType: 'arco',
    triples: [
      { predicate: 'rdf:type', value: 'hdt:HC1' },
      { predicate: 'dc:source', value: asString(metadata?.sourceUri) || 'ARCO_PLACEHOLDER' },
    ],
    notes: [
      'ARCO ontology mapping is a placeholder and must be implemented with source-specific field mapping.',
    ],
  };
}

export const arcoSourceAdapter: PhysicalObjectSourceAdapter<ArcoFormState> = {
  sourceType: 'arco',
  label: 'ARCO Catalog',
  description: 'Import HC1 metadata from ARCO catalog (placeholder).',
  status: 'placeholder',
  createInitialState: () => ({
    catalogId: '',
  }),
  ImportForm: ArcoImportForm,
  buildImportRequest: (_projectId: string, state: ArcoFormState) => {
    const id = state.catalogId.trim();
    const sourceUri = id
      ? `https://dati.beniculturali.it/arco/resource/CulturalProperty/${id}`
      : 'https://dati.beniculturali.it/arco/resource/CulturalProperty/ARCO_PLACEHOLDER';

    return {
      sourceType: 'arco',
      sourceUri,
      payload: {
        catalogId: id,
      },
    };
  },
  MetadataView: ArcoMetadataView,
  mapToHdtOntology: mapArcoToHdtOntology,
};
