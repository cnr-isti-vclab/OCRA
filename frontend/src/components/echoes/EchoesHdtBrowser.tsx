import { useEffect, useState, type ReactNode } from 'react';
import type { EchoesHdtDetail, EchoesHdtListItem } from '../../types';
import { fetchEchoesHdtDetail, fetchEchoesHdts } from '../../services/EchoesApi';

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

  return Array.from(map.values()).sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
}

export interface EchoesHdtBrowserSelection {
  item: EchoesHdtListItem;
  detail: EchoesHdtDetail;
  selectedItemKey: string;
}

interface EchoesHdtBrowserRenderState {
  selection: EchoesHdtBrowserSelection | null;
  detailBusy: boolean;
  detailError: string | null;
}

interface EchoesHdtBrowserProps {
  disabled?: boolean;
  searchPanelTitle?: string;
  searchPlaceholder?: string;
  rightPanelTitle?: string;
  emptyStateText?: string;
  searchResultsMaxHeight?: number | string;
  searchPanelBackground?: string;
  detailPanelBackground?: string;
  onSelectionChange?: (selection: EchoesHdtBrowserSelection | null) => void;
  renderDetailPanel?: (state: EchoesHdtBrowserRenderState) => ReactNode;
}

function DefaultDetailPanel({
  selection,
  detailBusy,
  detailError,
  emptyStateText,
}: EchoesHdtBrowserRenderState & { emptyStateText: string }) {
  if (!selection && !detailBusy) {
    return <div className="alert alert-light border mb-0">{emptyStateText}</div>;
  }

  if (detailBusy) {
    return <div className="alert alert-info mb-0">Loading ECCCH HDT details...</div>;
  }

  if (detailError) {
    return <div className="alert alert-danger mb-0">{detailError}</div>;
  }

  if (!selection) {
    return null;
  }

  const { detail, item } = selection;

  return (
    <div className="border rounded-3 p-3" style={{ backgroundColor: '#f7f7f2', borderColor: '#e8e2c8' }}>
      <div className="fw-semibold fs-5">{detail.physicalObjectMetadata.dublinCore?.title || detail.digitalTwinLabel || detail.digitalTwinUri}</div>
      {detail.digitalTwinLabel && (
        <div className="small text-muted">HDT label: {detail.digitalTwinLabel}</div>
      )}
      <div className="small text-muted mt-2 text-break">Digital Twin URI: {detail.digitalTwinUri}</div>
      <div className="small text-muted text-break">Named Graph: {detail.namedGraphUri}</div>
      {item.graphDate && (
        <div className="small text-muted">Graph date: {formatOptionalGraphDate(item.graphDate)}</div>
      )}
      {detail.heritageEntityUri && (
        <div className="small text-muted text-break">HC1 URI: {detail.heritageEntityUri}</div>
      )}
      <div className="small text-muted text-break">
        OCRA snapshot: {detail.projectSnapshot ? `available (v${detail.projectSnapshot.version})` : 'not available'}
      </div>
    </div>
  );
}

export default function EchoesHdtBrowser({
  disabled = false,
  searchPanelTitle = 'Search HDTs',
  searchPlaceholder = 'Try "lamina"',
  rightPanelTitle = 'Preview',
  emptyStateText = 'Select an HDT from the left column.',
  searchResultsMaxHeight = '420px',
  searchPanelBackground = 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
  detailPanelBackground = 'linear-gradient(180deg, #fffef7 0%, #ffffff 100%)',
  onSelectionChange,
  renderDetailPanel,
}: EchoesHdtBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<EchoesHdtListItem[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selection, setSelection] = useState<EchoesHdtBrowserSelection | null>(null);
  const [expandedRootKeys, setExpandedRootKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [onSelectionChange, selection]);

  async function handleSearch(): Promise<void> {
    try {
      setSearchBusy(true);
      setSearchError(null);
      setSelectedItemKey(null);
      setSelection(null);
      setDetailError(null);
      setExpandedRootKeys(new Set());
      const items = await fetchEchoesHdts(searchTerm);
      setSearchResults(items);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Failed to search ECCCH HDTs.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleSelectHdt(item: EchoesHdtListItem): Promise<void> {
    const nextSelectedItemKey = `${item.namedGraphUri}::${item.digitalTwinUri}`;

    try {
      setSelectedItemKey(nextSelectedItemKey);
      setSelection(null);
      setDetailBusy(true);
      setDetailError(null);

      const detail = await fetchEchoesHdtDetail(item.digitalTwinUri, item.namedGraphUri);
      setSelection({
        item,
        detail,
        selectedItemKey: nextSelectedItemKey,
      });
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Failed to load ECCCH HDT detail.');
    } finally {
      setDetailBusy(false);
    }
  }

  const treeNodes = buildHdtTree(searchResults);
  const detailPanel = renderDetailPanel
    ? renderDetailPanel({ selection, detailBusy, detailError })
    : (
      <DefaultDetailPanel
        selection={selection}
        detailBusy={detailBusy}
        detailError={detailError}
        emptyStateText={emptyStateText}
      />
    );

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-5">
        <div className="border rounded-3 p-3 h-100" style={{ background: searchPanelBackground }}>
          <h6 className="fw-bold mb-3">{searchPanelTitle}</h6>
          <div className="input-group mb-3">
            <input
              type="text"
              className="form-control"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
              disabled={searchBusy || disabled}
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
              disabled={searchBusy || disabled}
            >
              {searchBusy ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchError && <div className="alert alert-danger">{searchError}</div>}

          <div className="small text-muted mb-2">
            {treeNodes.length > 0
              ? `${treeNodes.length} HDT${treeNodes.length === 1 ? '' : 's'} (${searchResults.length} version${searchResults.length === 1 ? '' : 's'})`
              : 'No results loaded yet.'}
          </div>

          <div style={{ maxHeight: searchResultsMaxHeight, overflowY: 'auto' }}>
            {treeNodes.map((node) => {
              const isExpanded = expandedRootKeys.has(node.digitalTwinUri);
              const hasSelectedVersion = node.versions.some(
                (version) => `${version.namedGraphUri}::${version.digitalTwinUri}` === selectedItemKey,
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
                    disabled={detailBusy || disabled}
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
                      {node.versions.map((version, index) => {
                        const versionKey = `${version.namedGraphUri}::${version.digitalTwinUri}`;
                        const isSelected = versionKey === selectedItemKey;

                        return (
                          <button
                            key={versionKey}
                            type="button"
                            className={`btn text-start border ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => void handleSelectHdt(version)}
                            disabled={detailBusy || disabled}
                          >
                            <div className="d-flex align-items-center gap-2">
                              {index === 0 && (
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
        <div className="border rounded-3 p-3 h-100" style={{ background: detailPanelBackground }}>
          <h6 className="fw-bold mb-3">{rightPanelTitle}</h6>
          {detailPanel}
        </div>
      </div>
    </div>
  );
}
