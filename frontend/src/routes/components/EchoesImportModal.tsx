import { useCallback, useEffect, useState } from 'react';
import EchoesHdtBrowser, {
  type EchoesHdtBrowserSelection,
} from '../../components/echoes/EchoesHdtBrowser';
import { createProjectFromEchoesHdt } from '../../services/EchoesApi';
import type { EchoesImportMode } from '../../types';

interface EchoesImportModalProps {
  show: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}

function resolveDetailProjectName(selection: EchoesHdtBrowserSelection): string {
  const { detail } = selection;
  return (
    detail.physicalObjectMetadata.dublinCore?.title ||
    detail.physicalObjectMetadata.sourceRecord?.['heritageEntityLabel']?.toString() ||
    detail.digitalTwinLabel ||
    detail.digitalTwinUri
  );
}

export default function EchoesImportModal({
  show,
  onClose,
  onImported,
}: EchoesImportModalProps) {
  const [selection, setSelection] = useState<EchoesHdtBrowserSelection | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectPublic, setProjectPublic] = useState(false);
  const [importMode, setImportMode] = useState<EchoesImportMode>('metadata_assets');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      return;
    }

    setImportError(null);
  }, [show]);

  const handleSelectionChange = useCallback((nextSelection: EchoesHdtBrowserSelection | null): void => {
    setSelection(nextSelection);
    setImportError(null);

    if (!nextSelection) {
      return;
    }

    setProjectName(resolveDetailProjectName(nextSelection));
    setProjectDescription(nextSelection.detail.physicalObjectMetadata.dublinCore?.description || '');
    setProjectPublic(false);
    setImportMode(nextSelection.detail.projectSnapshot ? 'full_project_without_annotations' : 'metadata_assets');
  }, []);

  async function handleImport(): Promise<void> {
    if (!selection) {
      setImportError('Select an ECCCH HDT before importing.');
      return;
    }

    try {
      setImportBusy(true);
      setImportError(null);
      const response = await createProjectFromEchoesHdt({
        digitalTwinUri: selection.detail.digitalTwinUri,
        namedGraphUri: selection.detail.namedGraphUri || undefined,
        name: projectName.trim() || undefined,
        description: projectDescription.trim() || undefined,
        public: projectPublic,
        importMode,
      });
      onImported(response.project.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import the project from ECCCH.');
    } finally {
      setImportBusy(false);
    }
  }

  if (!show) {
    return null;
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style={{ minHeight: '88vh' }}>
        <div className="modal-content" style={{ minHeight: '88vh' }}>
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-1">Import from ECCCH</h5>
              <div className="small text-muted">
                Search an HDT in the ECCCH repository, preview its HC1 data and create a new OCRA project from it.
              </div>
            </div>
            <button type="button" className="btn-close" onClick={() => !importBusy && onClose()} aria-label="Close"></button>
          </div>

          <div className="modal-body">
            <EchoesHdtBrowser
              disabled={importBusy}
              searchPanelTitle="1. Search HDTs"
              rightPanelTitle="2. Preview and Import"
              emptyStateText="Select an HDT from the left column to preview its HC1 data and linked assets."
              onSelectionChange={handleSelectionChange}
              renderDetailPanel={({ selection: currentSelection, detailBusy, detailError }) => {
                if (!currentSelection && !detailBusy) {
                  return (
                    <div className="alert alert-light border mb-0">
                      Select an HDT from the left column to preview its HC1 data and linked assets.
                    </div>
                  );
                }

                if (detailBusy) {
                  return <div className="alert alert-info mb-0">Loading ECCCH HDT details...</div>;
                }

                if (detailError) {
                  return <div className="alert alert-danger">{detailError}</div>;
                }

                if (!currentSelection) {
                  return null;
                }

                const { detail, item } = currentSelection;

                return (
                  <>
                    <div className="mb-3 p-3 rounded-3" style={{ backgroundColor: '#f7f7f2', border: '1px solid #e8e2c8' }}>
                      <div className="fw-semibold fs-5">{resolveDetailProjectName(currentSelection)}</div>
                      {detail.digitalTwinLabel && (
                        <div className="small text-muted">HDT label: {detail.digitalTwinLabel}</div>
                      )}
                      <div className="small text-muted mt-2 text-break">Digital Twin URI: {detail.digitalTwinUri}</div>
                      <div className="small text-muted text-break">Named Graph: {detail.namedGraphUri}</div>
                      {item.graphDate && (
                        <div className="small text-muted">Graph date: {item.graphDate}</div>
                      )}
                      {detail.heritageEntityUri && (
                        <div className="small text-muted text-break">HC1 URI: {detail.heritageEntityUri}</div>
                      )}
                    </div>

                    <div className="row g-3 mb-3">
                      <div className="col-12">
                        <label htmlFor="echoesProjectName" className="form-label">New Project Name</label>
                        <input
                          id="echoesProjectName"
                          type="text"
                          className="form-control"
                          value={projectName}
                          onChange={(event) => setProjectName(event.target.value)}
                          disabled={importBusy}
                        />
                      </div>
                      <div className="col-12">
                        <label htmlFor="echoesProjectDescription" className="form-label">Description</label>
                        <textarea
                          id="echoesProjectDescription"
                          className="form-control"
                          rows={4}
                          value={projectDescription}
                          onChange={(event) => setProjectDescription(event.target.value)}
                          disabled={importBusy}
                        />
                      </div>
                      <div className="col-12">
                        <div className="form-check">
                          <input
                            id="echoesProjectPublic"
                            className="form-check-input"
                            type="checkbox"
                            checked={projectPublic}
                            onChange={(event) => setProjectPublic(event.target.checked)}
                            disabled={importBusy}
                          />
                          <label className="form-check-label" htmlFor="echoesProjectPublic">
                            Public project
                          </label>
                        </div>
                      </div>
                      <div className="col-12">
                        <label className="form-label">Import Mode</label>
                        <div className="d-flex flex-column gap-2">
                          <div className="form-check">
                            <input
                              id="echoesImportModeMetadata"
                              className="form-check-input"
                              type="radio"
                              name="echoesImportMode"
                              checked={importMode === 'metadata_assets'}
                              onChange={() => setImportMode('metadata_assets')}
                              disabled={importBusy}
                            />
                            <label className="form-check-label" htmlFor="echoesImportModeMetadata">
                              Metadata and portable assets only
                            </label>
                          </div>
                          <div className="form-check">
                            <input
                              id="echoesImportModeFullNoAnnotations"
                              className="form-check-input"
                              type="radio"
                              name="echoesImportMode"
                              checked={importMode === 'full_project_without_annotations'}
                              onChange={() => setImportMode('full_project_without_annotations')}
                              disabled={importBusy || !detail.projectSnapshot}
                            />
                            <label className="form-check-label" htmlFor="echoesImportModeFullNoAnnotations">
                              Full OCRA project without annotations
                            </label>
                          </div>
                          <div className="form-check">
                            <input
                              id="echoesImportModeFullWithAnnotations"
                              className="form-check-input"
                              type="radio"
                              name="echoesImportMode"
                              checked={importMode === 'full_project_with_annotations'}
                              onChange={() => setImportMode('full_project_with_annotations')}
                              disabled={importBusy || !detail.projectSnapshot || detail.projectSnapshot.includesAnnotations === false}
                            />
                            <label className="form-check-label" htmlFor="echoesImportModeFullWithAnnotations">
                              Full OCRA project with annotations
                            </label>
                          </div>
                        </div>
                        <div className="form-text">
                          {detail.projectSnapshot
                            ? [
                                `This named graph links an OCRA snapshot (${detail.projectSnapshot.format}, v${detail.projectSnapshot.version}).`,
                                detail.projectSnapshot.includesAnnotations === true
                                  ? ' Annotations are included.'
                                  : detail.projectSnapshot.includesAnnotations === false
                                    ? ' This snapshot was exported without annotations.'
                                    : '',
                              ].join('')
                            : 'This named graph does not expose an OCRA snapshot, so only metadata and assets can be imported.'}
                        </div>
                      </div>
                    </div>

                    <div className="row g-3">
                      <div className="col-12 col-xl-7">
                        <div className="border rounded-3 p-3 h-100 overflow-hidden">
                          <div className="fw-semibold mb-2">Imported HC1 metadata</div>
                          <dl className="row small mb-0">
                            <dt className="col-sm-4">Identifier</dt>
                            <dd className="col-sm-8 text-break">{detail.physicalObjectMetadata.dublinCore?.identifier || '—'}</dd>
                            <dt className="col-sm-4">Creator</dt>
                            <dd className="col-sm-8 text-break">{detail.physicalObjectMetadata.dublinCore?.creator || '—'}</dd>
                            <dt className="col-sm-4">Coverage</dt>
                            <dd className="col-sm-8 text-break">{detail.physicalObjectMetadata.dublinCore?.coverage || '—'}</dd>
                            <dt className="col-sm-4">Source</dt>
                            <dd className="col-sm-8 text-break">{detail.physicalObjectMetadata.dublinCore?.source || '—'}</dd>
                          </dl>
                        </div>
                      </div>
                      <div className="col-12 col-xl-5">
                        <div className="border rounded-3 p-3 h-100 overflow-hidden">
                          <div className="fw-semibold mb-2">Linked assets</div>
                          {detail.assets.length === 0 ? (
                            <div className="small text-muted">No HC8 assets linked to this HDT.</div>
                          ) : (
                            <div className="d-grid gap-2">
                              {detail.assets.map((asset) => (
                                <div key={asset.assetUri} className="rounded-3 p-2" style={{ backgroundColor: '#f8f9fa' }}>
                                  <div className="d-flex justify-content-between align-items-start gap-2">
                                    <div className="fw-semibold small text-break" style={{ minWidth: 0 }}>
                                      {asset.label || asset.title || asset.assetUri}
                                    </div>
                                    <span className={`badge ${asset.importable ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'}`}>
                                      {asset.importable ? 'Importable' : 'Not importable'}
                                    </span>
                                  </div>
                                  <div className="small text-muted text-break">{asset.format || 'Unknown format'}</div>
                                  <div className="small text-muted text-break">{asset.source || 'No source URL'}</div>
                                  {!asset.importable && (
                                    <div className="small text-warning mt-1 text-break">{asset.importIssue || 'This asset cannot be imported into OCRA.'}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {importError && (
                      <div className="alert alert-danger mt-3 mb-0">{importError}</div>
                    )}
                  </>
                );
              }}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={importBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => void handleImport()}
              disabled={importBusy || !selection}
            >
              {importBusy ? 'Importing...' : 'Create Project from ECCCH'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
