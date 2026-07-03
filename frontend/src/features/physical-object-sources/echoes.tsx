import EchoesHdtBrowser, {
  type EchoesHdtBrowserSelection,
} from '../../components/echoes/EchoesHdtBrowser';
import type {
  PhysicalObjectSourceAdapter,
  PhysicalObjectSourceFormProps,
} from './types';
import { DefaultMetadataView, defaultMapToHdtOntology, getSourceRecordField } from './shared';

interface EchoesSelectedGraph {
  digitalTwinUri: string;
  namedGraphUri: string;
  digitalTwinLabel: string | null;
  heritageEntityUri: string | null;
  graphDate: string | null;
  dublinCore: {
    title?: string;
    creator?: string;
    subject?: string;
    description?: string;
    date?: string;
    type?: string;
    identifier?: string;
    source?: string;
    language?: string;
    coverage?: string;
    rights?: string;
  };
}

export interface EchoesFormState {
  selectedGraph: EchoesSelectedGraph | null;
}

function buildSelectedGraph(selection: EchoesHdtBrowserSelection): EchoesSelectedGraph {
  return {
    digitalTwinUri: selection.detail.digitalTwinUri,
    namedGraphUri: selection.detail.namedGraphUri,
    digitalTwinLabel: selection.detail.digitalTwinLabel,
    heritageEntityUri: selection.detail.heritageEntityUri,
    graphDate: selection.item.graphDate,
    dublinCore: {
      ...selection.detail.physicalObjectMetadata.dublinCore,
    },
  };
}

function EchoesImportForm({
  state,
  onChange,
  disabled,
}: PhysicalObjectSourceFormProps<EchoesFormState>) {
  const selectedGraph = state?.selectedGraph ?? null;

  return (
    <div className="border rounded p-3 bg-light">
      <h6 className="mb-3">ECCCH Import Parameters</h6>
      <p className="small text-muted">
        Choose the ECCCH named graph to use as source. OCRA will import only the Heritage Entity metadata from the selected graph.
      </p>

      <EchoesHdtBrowser
        disabled={disabled}
        searchPanelTitle="1. Search HDTs"
        rightPanelTitle="2. Selected Heritage Entity Source"
        emptyStateText="Select an ECCCH named graph to import its Heritage Entity metadata."
        isItemSelectable={(item) => item.graphState === 'current'}
        onSelectionChange={(selection) => {
          onChange({
            ...state,
            selectedGraph: selection ? buildSelectedGraph(selection) : null,
          });
        }}
        renderDetailPanel={({ selection, detailBusy, detailError }) => {
          if (!selection && !detailBusy) {
            return (
              <div className="alert alert-light border mb-0">
                Select an ECCCH named graph to import its Heritage Entity metadata.
              </div>
            );
          }

          if (detailBusy) {
            return <div className="alert alert-info mb-0">Loading ECCCH Heritage Entity metadata...</div>;
          }

          if (detailError) {
            return <div className="alert alert-danger mb-0">{detailError}</div>;
          }

          if (!selection) {
            return null;
          }

          const currentGraph = buildSelectedGraph(selection);

          return (
            <>
              <div className="border rounded-3 p-3 mb-3" style={{ backgroundColor: '#f7f7f2', borderColor: '#e8e2c8' }}>
                <div className="fw-semibold fs-6">
                  {currentGraph.dublinCore.title || currentGraph.digitalTwinLabel || currentGraph.digitalTwinUri}
                </div>
                <div className="small text-muted mt-2 text-break">Digital Twin URI: {currentGraph.digitalTwinUri}</div>
                <div className="small text-muted text-break">Named Graph: {currentGraph.namedGraphUri}</div>
                {currentGraph.heritageEntityUri && (
                  <div className="small text-muted text-break">Heritage Entity URI: {currentGraph.heritageEntityUri}</div>
                )}
                {currentGraph.graphDate && (
                  <div className="small text-muted">Graph date: {currentGraph.graphDate}</div>
                )}
              </div>

              <div className="border rounded-3 p-3">
                <div className="fw-semibold mb-2">Heritage Entity metadata that will be imported</div>
                <dl className="row small mb-0">
                  <dt className="col-sm-4">Title</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.title || '—'}</dd>
                  <dt className="col-sm-4">Identifier</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.identifier || '—'}</dd>
                  <dt className="col-sm-4">Creator</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.creator || '—'}</dd>
                  <dt className="col-sm-4">Description</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.description || '—'}</dd>
                  <dt className="col-sm-4">Coverage</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.coverage || '—'}</dd>
                  <dt className="col-sm-4">Source</dt>
                  <dd className="col-sm-8 text-break">{currentGraph.dublinCore.source || '—'}</dd>
                </dl>
              </div>

              {selection.detail.assets.length > 0 && (
                <div className="alert alert-secondary mt-3 mb-0 small">
                  HC8 assets are intentionally ignored in this flow. Only Heritage Entity metadata will be imported into the project settings.
                </div>
              )}
            </>
          );
        }}
      />

      {!selectedGraph && (
        <div className="alert alert-warning mt-3 mb-0 small">
          Choose the current named graph before importing from the ECCCH repository.
        </div>
      )}
    </div>
  );
}

function EchoesMetadataView({ metadata }: { metadata: import('./types').PhysicalObjectMetadataRecord | null }) {
  return (
    <DefaultMetadataView metadata={metadata}>
      <h6 className="mb-2">Import Record</h6>
      <ul className="list-group list-group-flush border rounded">
        <li className="list-group-item d-flex justify-content-between gap-3">
          <span>Digital Twin URI</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'digitalTwinUri') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between gap-3">
          <span>Named Graph URI</span>
          <code className="text-break text-end">{getSourceRecordField(metadata, 'namedGraphUri') || '-'}</code>
        </li>
        <li className="list-group-item d-flex justify-content-between">
          <span>Graph Date</span>
          <span>{getSourceRecordField(metadata, 'graphDate') || '-'}</span>
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
  label: 'ECCCH Repository',
  description: 'Import Heritage Entity metadata from a selected named graph in the ECCCH repository.',
  status: 'available',
  createInitialState: () => ({
    selectedGraph: null,
  }),
  ImportForm: EchoesImportForm,
  buildImportRequest: (_projectId: string, state: EchoesFormState) => {
    const selectedGraph = state?.selectedGraph ?? null;
    if (!selectedGraph) {
      throw new Error('Choose an ECCCH named graph before importing Heritage Entity metadata.');
    }

    return {
      sourceType: 'echoes',
      sourceUri: selectedGraph.heritageEntityUri || selectedGraph.digitalTwinUri,
      payload: {
        digitalTwinUri: selectedGraph.digitalTwinUri,
        namedGraphUri: selectedGraph.namedGraphUri,
        digitalTwinLabel: selectedGraph.digitalTwinLabel,
        heritageEntityUri: selectedGraph.heritageEntityUri,
        graphDate: selectedGraph.graphDate,
        dublinCore: selectedGraph.dublinCore,
      },
    };
  },
  MetadataView: EchoesMetadataView,
  mapToHdtOntology: (metadata) => defaultMapToHdtOntology(metadata, 'echoes', [
    'Mapping is generated from HC1 Dublin Core fields selected from an ECCCH named graph.',
  ]),
};
