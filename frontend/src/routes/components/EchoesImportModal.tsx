import { useEffect, useState } from 'react';
import type { EchoesHdtDetail, EchoesHdtListItem } from '../../types';
import {
  clearEchoesDevBearer,
  createProjectFromEchoesHdt,
  fetchEchoesHdtDetail,
  fetchEchoesHdts,
  registerEchoesDevBearer,
} from '../../services/EchoesApi';

interface EchoesImportModalProps {
  show: boolean;
  onClose: () => void;
  onImported: (projectId: string) => void;
}


function formatOptionalGraphDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const hasTime = value.includes('T');
  const date = hasTime ? new Date(value) : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  };
  if (hasTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.second = '2-digit';
  }

  return new Intl.DateTimeFormat('it-IT', options).format(date);
}

interface HdtTreeNode {
  digitalTwinUri: string;
  displayTitle: string;
  identifier: string | null;
  versions: EchoesHdtListItem[];
}

function buildHdtTree(items: EchoesHdtListItem[]): HdtTreeNode[] {
  const map = new Map<string, HdtTreeNode>();
  for (const item of items) {
    if (!map.has(item.digitalTwinUri)) {
      map.set(item.digitalTwinUri, {
        digitalTwinUri: item.digitalTwinUri,
        displayTitle: item.label || item.title || item.identifier || item.digitalTwinUri,
        identifier: item.identifier,
        versions: [],
      });
    }
    map.get(item.digitalTwinUri)!.versions.push(item);
  }
  for (const node of map.values()) {
    node.versions.sort((a, b) => (b.graphDate ?? '').localeCompare(a.graphDate ?? ''));
  }
  return Array.from(map.values()).sort((a, b) =>
    a.displayTitle.localeCompare(b.displayTitle),
  );
}

function resolveDetailProjectName(detail: EchoesHdtDetail): string {
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
  const [bearer, setBearer] = useState('');
  const [devBearerBusy, setDevBearerBusy] = useState(false);
  const [devBearerMessage, setDevBearerMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<EchoesHdtListItem[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EchoesHdtDetail | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectPublic, setProjectPublic] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [expandedRootKeys, setExpandedRootKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!show) {
      return;
    }

    setDevBearerMessage(null);
    setSearchError(null);
    setDetailError(null);
    setImportError(null);
  }, [show]);

  async function handleRegisterBearer(): Promise<void> {
    const trimmedBearer = bearer.trim();
    if (!trimmedBearer) {
      setDevBearerMessage('Paste a bearer token before saving it.');
      return;
    }

    try {
      setDevBearerBusy(true);
      setDevBearerMessage(null);
      await registerEchoesDevBearer({ bearer: trimmedBearer, scope: 'import' });
      setDevBearerMessage('Temporary ECHOES bearer saved for this session.');
    } catch (error) {
      setDevBearerMessage(error instanceof Error ? error.message : 'Failed to save the bearer.');
    } finally {
      setDevBearerBusy(false);
    }
  }

  async function handleClearBearer(): Promise<void> {
    try {
      setDevBearerBusy(true);
      setDevBearerMessage(null);
      await clearEchoesDevBearer({ scope: 'import' });
      setBearer('');
      setDevBearerMessage('Temporary ECHOES bearer removed from this session.');
    } catch (error) {
      setDevBearerMessage(error instanceof Error ? error.message : 'Failed to clear the bearer.');
    } finally {
      setDevBearerBusy(false);
    }
  }

  async function handleSearch(): Promise<void> {
    try {
      setSearchBusy(true);
      setSearchError(null);
      setSelectedItemKey(null);
      setSelectedDetail(null);
      setExpandedRootKeys(new Set());
      const items = await fetchEchoesHdts(searchTerm);
      setSearchResults(items);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Failed to search ECHOES HDTs.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleSelectHdt(item: EchoesHdtListItem): Promise<void> {
    try {
      setSelectedItemKey(`${item.namedGraphUri}::${item.digitalTwinUri}`);
      setSelectedDetail(null);
      setDetailBusy(true);
      setDetailError(null);
      setImportError(null);
      const detail = await fetchEchoesHdtDetail(item.digitalTwinUri, item.namedGraphUri);
      setSelectedDetail(detail);
      setProjectName(resolveDetailProjectName(detail));
      setProjectDescription(detail.physicalObjectMetadata.dublinCore?.description || '');
      setProjectPublic(false);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Failed to load ECHOES HDT detail.');
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedDetail) {
      setImportError('Select an ECHOES HDT before importing.');
      return;
    }

    try {
      setImportBusy(true);
      setImportError(null);
      const response = await createProjectFromEchoesHdt({
        digitalTwinUri: selectedDetail.digitalTwinUri,
        namedGraphUri: selectedDetail.namedGraphUri || undefined,
        name: projectName.trim() || undefined,
        description: projectDescription.trim() || undefined,
        public: projectPublic,
      });
      onImported(response.project.id);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import the project from ECHOES.');
    } finally {
      setImportBusy(false);
    }
  }

  if (!show) {
    return null;
  }

  return (
    <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-1">Import from ECHOES</h5>
              <div className="small text-muted">
                Search an HDT in the ECHOES KB, preview its HC1 data and create a new OCRA project from it.
              </div>
            </div>
            <button type="button" className="btn-close" onClick={() => !importBusy && onClose()} aria-label="Close"></button>
          </div>

          <div className="modal-body">
            <div className="row g-4">
              <div className="col-12 col-lg-5">
                <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)' }}>
                  <h6 className="fw-bold mb-3">1. Session Bearer</h6>
                  <p className="small text-muted mb-3">
                    Temporary development bridge. If OCRA already carries a valid ECHOES bearer from login, you can skip this step.
                  </p>

                  <label htmlFor="echoesBearer" className="form-label">EGI / ECHOES Bearer</label>
                  <textarea
                    id="echoesBearer"
                    className="form-control"
                    rows={5}
                    value={bearer}
                    onChange={(event) => setBearer(event.target.value)}
                    disabled={devBearerBusy || importBusy}
                    placeholder="Paste the bearer token used in Swagger"
                  />

                  <div className="d-flex gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => void handleRegisterBearer()}
                      disabled={devBearerBusy || importBusy}
                    >
                      {devBearerBusy ? 'Saving...' : 'Save Bearer'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => void handleClearBearer()}
                      disabled={devBearerBusy || importBusy}
                    >
                      Clear
                    </button>
                  </div>

                  {devBearerMessage && (
                    <div className={`alert mt-3 mb-0 ${devBearerMessage.includes('Failed') || devBearerMessage.includes('Paste') ? 'alert-warning' : 'alert-success'}`}>
                      {devBearerMessage}
                    </div>
                  )}

                  <hr className="my-4" />

                  <h6 className="fw-bold mb-3">2. Search HDTs</h6>
                  <div className="input-group mb-3">
                    <input
                      type="text"
                      className="form-control"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder='Try "lamina"'
                      disabled={searchBusy || importBusy}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSearch();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleSearch()}
                      disabled={searchBusy || importBusy}
                    >
                      {searchBusy ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {searchError && <div className="alert alert-danger">{searchError}</div>}

                  {(() => {
                    const treeNodes = buildHdtTree(searchResults);
                    return (
                      <div className="small text-muted mb-2">
                        {treeNodes.length > 0
                          ? `${treeNodes.length} HDT${treeNodes.length === 1 ? '' : 's'} (${searchResults.length} version${searchResults.length === 1 ? '' : 's'})`
                          : 'No results loaded yet.'}
                      </div>
                    );
                  })()}

                  <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                    {buildHdtTree(searchResults).map((node) => {
                      const isExpanded = expandedRootKeys.has(node.digitalTwinUri);
                      const hasSelectedVersion = node.versions.some(
                        (v) => `${v.namedGraphUri}::${v.digitalTwinUri}` === selectedItemKey,
                      );

                      return (
                        <div key={node.digitalTwinUri} className="mb-1">
                          <button
                            type="button"
                            className={`btn text-start w-100 border ${hasSelectedVersion ? 'border-primary' : ''} btn-light`}
                            onClick={() =>
                              setExpandedRootKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(node.digitalTwinUri)) {
                                  next.delete(node.digitalTwinUri);
                                } else {
                                  next.add(node.digitalTwinUri);
                                }
                                return next;
                              })
                            }
                            disabled={detailBusy || importBusy}
                          >
                            <div className="d-flex align-items-start gap-2">
                              <span className="text-muted mt-1" style={{ fontSize: '0.65em', lineHeight: 1 }}>
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div className="fw-semibold text-break">{node.displayTitle}</div>
                                {node.identifier && (
                                  <div className="small text-muted text-break">ID: {node.identifier}</div>
                                )}
                                <div className="small text-muted">
                                  {node.versions.length} version{node.versions.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="ms-3 mt-1 d-grid gap-1">
                              {node.versions.map((version, idx) => {
                                const versionKey = `${version.namedGraphUri}::${version.digitalTwinUri}`;
                                const isSelected = versionKey === selectedItemKey;
                                return (
                                  <button
                                    key={versionKey}
                                    type="button"
                                    className={`btn text-start border ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    onClick={() => void handleSelectHdt(version)}
                                    disabled={detailBusy || importBusy}
                                  >
                                    <div className="d-flex align-items-center gap-2">
                                      {idx === 0 && (
                                        <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-success'}`}>
                                          latest
                                        </span>
                                      )}
                                      <span className={`fw-semibold small ${isSelected ? '' : 'text-muted'}`}>
                                        {formatOptionalGraphDate(version.graphDate) ?? version.namedGraphUri}
                                      </span>
                                    </div>
                                    <div className={`small text-break mt-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                                      {version.namedGraphUri}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-7">
                <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg, #fffef7 0%, #ffffff 100%)' }}>
                  <h6 className="fw-bold mb-3">3. Preview and Import</h6>

                  {!selectedItemKey && !detailBusy && (
                    <div className="alert alert-light border mb-0">
                      Select an HDT from the left column to preview its HC1 data and linked assets.
                    </div>
                  )}

                  {detailBusy && (
                    <div className="alert alert-info mb-0">Loading ECHOES HDT details...</div>
                  )}

                  {detailError && (
                    <div className="alert alert-danger">{detailError}</div>
                  )}

                  {selectedDetail && (
                    <>
                      <div className="mb-3 p-3 rounded-3" style={{ backgroundColor: '#f7f7f2', border: '1px solid #e8e2c8' }}>
                        <div className="fw-semibold fs-5">{resolveDetailProjectName(selectedDetail)}</div>
                        {selectedDetail.digitalTwinLabel && (
                          <div className="small text-muted">HDT label: {selectedDetail.digitalTwinLabel}</div>
                        )}
                        <div className="small text-muted mt-2">Digital Twin URI: {selectedDetail.digitalTwinUri}</div>
                        <div className="small text-muted">Named Graph: {selectedDetail.namedGraphUri}</div>
                        {selectedDetail.heritageEntityUri && (
                          <div className="small text-muted">HC1 URI: {selectedDetail.heritageEntityUri}</div>
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
                      </div>

                      <div className="row g-3">
                        <div className="col-12 col-xl-7">
                          <div className="border rounded-3 p-3 h-100 overflow-hidden">
                            <div className="fw-semibold mb-2">Imported HC1 metadata</div>
                            <dl className="row small mb-0">
                              <dt className="col-sm-4">Identifier</dt>
                              <dd className="col-sm-8 text-break">{selectedDetail.physicalObjectMetadata.dublinCore?.identifier || '—'}</dd>
                              <dt className="col-sm-4">Creator</dt>
                              <dd className="col-sm-8 text-break">{selectedDetail.physicalObjectMetadata.dublinCore?.creator || '—'}</dd>
                              <dt className="col-sm-4">Coverage</dt>
                              <dd className="col-sm-8 text-break">{selectedDetail.physicalObjectMetadata.dublinCore?.coverage || '—'}</dd>
                              <dt className="col-sm-4">Source</dt>
                              <dd className="col-sm-8 text-break">{selectedDetail.physicalObjectMetadata.dublinCore?.source || '—'}</dd>
                            </dl>
                          </div>
                        </div>
                        <div className="col-12 col-xl-5">
                          <div className="border rounded-3 p-3 h-100 overflow-hidden">
                            <div className="fw-semibold mb-2">Linked assets</div>
                            {selectedDetail.assets.length === 0 ? (
                              <div className="small text-muted">No HC8 assets linked to this HDT.</div>
                            ) : (
                              <div className="d-grid gap-2">
                                {selectedDetail.assets.map((asset) => (
                                  <div key={asset.assetUri} className="rounded-3 p-2" style={{ backgroundColor: '#f8f9fa' }}>
                                    <div className="d-flex justify-content-between align-items-start gap-2">
                                      <div className="fw-semibold small text-break" style={{ minWidth: 0 }}>{asset.label || asset.title || asset.assetUri}</div>
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
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={importBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => void handleImport()}
              disabled={!selectedDetail || importBusy}
            >
              {importBusy ? 'Importing...' : 'Create Project from ECHOES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
