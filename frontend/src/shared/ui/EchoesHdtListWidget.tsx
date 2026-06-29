import type { EchoesNamedGraphListItem } from '../../types';

interface EchoesNamedGraphListWidgetProps {
  items: EchoesNamedGraphListItem[];
  loading: boolean;
  error: string | null;
  visible: boolean;
  onRefresh: () => void;
}

function getItemTitle(item: EchoesNamedGraphListItem): string {
  return item.label || item.title || item.identifier || item.namedGraphUri;
}

export default function EchoesHdtListWidget({
  items,
  loading,
  error,
  visible,
  onRefresh,
}: EchoesNamedGraphListWidgetProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h3 className="h6 text-secondary mb-0">Available Named Graphs</h3>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="small text-muted mb-2">
        Available named graphs from `/api/eccch/named-graphs`, with their related Digital Twin IDs.
      </div>
      {error ? (
        <div className="alert alert-warning mb-3">{error}</div>
      ) : null}
      <div
        className="border rounded-3 bg-light-subtle"
        style={{ maxHeight: '18rem', overflowY: 'auto' }}
      >
        {items.length > 0 ? (
          <div className="list-group list-group-flush">
            {items.map((item) => (
              <div key={`${item.digitalTwinUri}::${item.namedGraphUri}`} className="list-group-item bg-transparent">
                <div className="fw-semibold text-break">{getItemTitle(item)}</div>
                <div className="small text-muted mt-2">Named graph</div>
                <div className="small text-break">{item.namedGraphUri}</div>
                <div className="small text-muted mt-2">Digital Twin</div>
                <div className="small text-break">{item.digitalTwinUri}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 small text-muted">
            {loading ? 'Loading available named graphs...' : 'No named graphs found.'}
          </div>
        )}
      </div>
    </div>
  );
}
