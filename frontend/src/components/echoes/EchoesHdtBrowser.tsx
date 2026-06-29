import { useEffect, useState, type ReactNode } from 'react';
import type { EchoesHdtDetail, EchoesNamedGraphListItem } from '../../types';
import { fetchEchoesHdtDetail, fetchEchoesNamedGraphs } from '../../services/EchoesApi';

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

interface HdtVersionBranchNode {
  item: EchoesNamedGraphListItem;
  children: HdtVersionBranchNode[];
}

interface HdtTreeNode {
  digitalTwinUri: string;
  displayTitle: string;
  identifier: string | null;
  branches: HdtVersionBranchNode[];
  versionCount: number;
}

function buildHdtTree(items: EchoesNamedGraphListItem[]): HdtTreeNode[] {
  const map = new Map<string, HdtTreeNode>();
  for (const item of items) {
    if (!map.has(item.digitalTwinUri)) {
      map.set(item.digitalTwinUri, {
        digitalTwinUri: item.digitalTwinUri,
        displayTitle: item.label || item.title || item.identifier || item.digitalTwinUri,
        identifier: item.identifier,
        branches: [],
        versionCount: 0,
      });
    }
    map.get(item.digitalTwinUri)!.versionCount += 1;
  }

  const compareItemsDescending = (left: EchoesNamedGraphListItem, right: EchoesNamedGraphListItem): number => {
    return `${right.graphDate ?? ''}::${right.namedGraphUri}`.localeCompare(`${left.graphDate ?? ''}::${left.namedGraphUri}`);
  };

  const computeBranchLatestSortKey = (branch: HdtVersionBranchNode): string => {
    const childKeys = branch.children.map(computeBranchLatestSortKey);
    const ownKey = `${branch.item.graphDate ?? ''}::${branch.item.namedGraphUri}`;
    return childKeys.reduce((latest, current) => (current.localeCompare(latest) > 0 ? current : latest), ownKey);
  };

  const sortBranch = (branch: HdtVersionBranchNode): void => {
    branch.children.sort((left, right) => computeBranchLatestSortKey(right).localeCompare(computeBranchLatestSortKey(left)));
    branch.children.forEach(sortBranch);
  };

  for (const [digitalTwinUri, node] of map.entries()) {
    const dtItems = items
      .filter((item) => item.digitalTwinUri === digitalTwinUri)
      .sort(compareItemsDescending);
    const branchNodeByGraph = new Map<string, HdtVersionBranchNode>(
      dtItems.map((item) => [item.namedGraphUri, { item, children: [] }]),
    );
    const roots: HdtVersionBranchNode[] = [];

    for (const item of dtItems) {
      const branchNode = branchNodeByGraph.get(item.namedGraphUri);
      if (!branchNode) {
        continue;
      }

      const canAttachToPrevious =
        item.maintenanceMode === 'replace' &&
        typeof item.previousNamedGraphUri === 'string' &&
        item.previousNamedGraphUri.length > 0;
      const parentNode = canAttachToPrevious
        ? branchNodeByGraph.get(item.previousNamedGraphUri ?? '')
        : undefined;

      if (parentNode) {
        parentNode.children.push(branchNode);
      } else {
        roots.push(branchNode);
      }
    }

    roots.sort((left, right) => computeBranchLatestSortKey(right).localeCompare(computeBranchLatestSortKey(left)));
    roots.forEach(sortBranch);
    node.branches = roots;
  }

  return Array.from(map.values()).sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
}

function branchContainsSelection(branch: HdtVersionBranchNode, selectedItemKey: string | null): boolean {
  const branchKey = `${branch.item.namedGraphUri}::${branch.item.digitalTwinUri}`;
  if (branchKey === selectedItemKey) {
    return true;
  }

  return branch.children.some((child) => branchContainsSelection(child, selectedItemKey));
}

function renderMaintenanceBadge(item: EchoesNamedGraphListItem, isSelected: boolean): ReactNode {
  if (item.graphState === 'current') {
    return <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-success'}`}>current</span>;
  }

  if (item.maintenanceMode === 'add') {
    return <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-info text-dark'}`}>enrich</span>;
  }

  if (item.maintenanceMode === 'replace') {
    return <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-secondary'}`}>replace</span>;
  }

  return null;
}

export interface EchoesHdtBrowserSelection {
  item: EchoesNamedGraphListItem;
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
  isItemSelectable?: (item: EchoesNamedGraphListItem) => boolean;
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
      <div className="small text-muted text-break">
        Graph state: {item.graphState}
        {item.maintenanceMode !== 'unknown' ? `, maintenance: ${item.maintenanceMode}` : ''}
      </div>
      {item.previousNamedGraphUri && (
        <div className="small text-muted text-break">Previous named graph: {item.previousNamedGraphUri}</div>
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
  isItemSelectable = () => true,
  onSelectionChange,
  renderDetailPanel,
}: EchoesHdtBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<EchoesNamedGraphListItem[]>([]);
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
      const items = await fetchEchoesNamedGraphs(searchTerm);
      setSearchResults(items);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Failed to search ECCCH HDTs.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleSelectHdt(item: EchoesNamedGraphListItem): Promise<void> {
    if (!isItemSelectable(item)) {
      return;
    }

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

  function renderBranch(branch: HdtVersionBranchNode, depth: number): ReactNode {
    const version = branch.item;
    const versionKey = `${version.namedGraphUri}::${version.digitalTwinUri}`;
    const isSelected = versionKey === selectedItemKey;
    const selectable = isItemSelectable(version);

    return (
      <div key={versionKey} className="d-grid gap-1">
        <button
          type="button"
          className={`btn text-start border ${
            isSelected ? 'btn-primary' : selectable ? 'btn-outline-secondary' : 'btn-light'
          }`}
          onClick={() => void handleSelectHdt(version)}
          disabled={detailBusy || disabled || !selectable}
          style={{ marginLeft: '0px' }}
        >
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {renderMaintenanceBadge(version, isSelected)}
            <span className={`fw-semibold small ${isSelected ? '' : 'text-muted'}`}>
              {formatOptionalGraphDate(version.graphDate) ?? version.namedGraphUri}
            </span>
            {!selectable && (
              <span className={`badge ${isSelected ? 'bg-light text-primary' : 'bg-warning text-dark'}`}>
                history only
              </span>
            )}
          </div>
          <div className={`small text-break mt-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>
            {version.namedGraphUri}
          </div>
        </button>
        {branch.children.map((child) => renderBranch(child, depth + 1))}
      </div>
    );
  }

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
              const hasSelectedVersion = node.branches.some((branch) => branchContainsSelection(branch, selectedItemKey));

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
                          {node.versionCount} version{node.versionCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="ms-3 mt-1 d-grid gap-1">
                      {node.branches.map((branch) => renderBranch(branch, 0))}
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
