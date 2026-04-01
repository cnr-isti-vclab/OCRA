import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

const DEFAULT_ECHOES_ENDPOINT =
  'https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query';

const DEFAULT_TRIPLE_STORE_IDS = [
  '69088495d17ed4f51ab8f6a8',
  '69088509d17ed4f51ab8f6a9',
  '690885c3d17ed4f51ab8f6aa',
];

const DEFAULT_EXECUTOR_TRIPLE_STORE_ID = '68fa3ad9f20fe43d497686b3';

const DEFAULT_DATASET_URI = 'https://demo/HeritageDigitalTwin/CNR/OCRADEMO_12345';

export interface EchoesFormState {
  datasetUri: string;
}

function readDatasetUri(state: EchoesFormState | null | undefined): string {
  return typeof state?.datasetUri === 'string' ? state.datasetUri : '';
}

function buildEchoesQuery(datasetUri: string): string {
  return [
    'PREFIX htdo: <http://heritage-digital-twin-ontology/>',
    'PREFIX void: <http://rdfs.org/ns/void#>',
    'SELECT DISTINCT ?s ?p ?o {',
    '  GRAPH ?ng {',
    `    VALUES ?dt {<${datasetUri}>}`,
    '    ?dt a void:Dataset ; void:subset ?ng .',
    '    ?s ?p ?o',
    '  }',
    '}'
  ].join(' ');
}

function EchoesImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<EchoesFormState>) {
  const datasetUriValue = readDatasetUri(state);

  return (
    <div className="border rounded p-3 bg-light">
      <h6 className="mb-3">ECHOES Import Parameters</h6>
      <div className="mb-3">
        <label htmlFor="echoes-dataset-uri" className="form-label">
          Dataset URI
        </label>
        <input
          id="echoes-dataset-uri"
          type="text"
          className="form-control"
          value={datasetUriValue}
          onChange={(e) => onChange({ ...state, datasetUri: e.target.value })}
          disabled={disabled}
          placeholder={DEFAULT_DATASET_URI}
        />
        <small className="form-text text-muted">
          URI of the ECHOES dataset to query.
        </small>
      </div>
      <div className="mb-2">
        <small className="text-muted d-block">Endpoint (fixed)</small>
        <code>{DEFAULT_ECHOES_ENDPOINT}</code>
      </div>
      <div>
        <small className="text-muted d-block">Query</small>
        <small className="text-muted">
          A fixed SPARQL query is used to extract HC1 metadata from the selected dataset.
        </small>
      </div>
    </div>
  );
}

function EchoesMetadataView({ metadata }: { metadata: import('./types').PhysicalObjectMetadataRecord | null }) {
  return (
    <DefaultMetadataView metadata={metadata}>
      <h6 className="mb-2">Import Record</h6>
      <ul className="list-group list-group-flush border rounded">
        <li className="list-group-item d-flex justify-content-between">
          <span>Endpoint</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'endpoint') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Triple Count</span>
          <span>{getSourceRecordField(metadata, 'tripleCount') || '-'}</span>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Imported At</span>
          <span>{getSourceRecordField(metadata, 'importedAt') || '-'}</span>
        </li>
      </ul>
    </DefaultMetadataView>
  );
}

export const echoesSourceAdapter: PhysicalObjectSourceAdapter<EchoesFormState> = {
  sourceType: 'echoes',
  label: 'ECHOES KB',
  description: 'Import HC1 metadata from ECHOES KB using a fixed SPARQL query.',
  status: 'available',
  createInitialState: () => ({
    datasetUri: DEFAULT_DATASET_URI,
  }),
  ImportForm: EchoesImportForm,
  buildImportRequest: (_projectId: string, state: EchoesFormState) => {
    const sourceUri = readDatasetUri(state).trim() || DEFAULT_DATASET_URI;
    return {
      sourceType: 'echoes',
      sourceUri,
      payload: {
        endpoint: DEFAULT_ECHOES_ENDPOINT,
        queryPayload: {
          query: buildEchoesQuery(sourceUri),
          tripleStoreIds: DEFAULT_TRIPLE_STORE_IDS,
          executorTripleStoreId: DEFAULT_EXECUTOR_TRIPLE_STORE_ID,
        },
      },
    };
  },
  MetadataView: EchoesMetadataView,
  mapToHdtOntology: (m) => defaultMapToHdtOntology(m, 'echoes', ['Mapping is generated from cached Dublin Core fields extracted from ECHOES SPARQL results.']),
};
