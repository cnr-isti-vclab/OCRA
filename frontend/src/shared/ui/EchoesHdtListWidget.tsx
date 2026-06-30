import type { EchoesHdtListItem } from '../../types';

interface EchoesHdtListWidgetProps {
  items: EchoesHdtListItem[];
  loading: boolean;
  error: string | null;
  visible: boolean;
  onRefresh: () => void;
}

function getItemTitle(item: EchoesHdtListItem): string {
  return item.label || item.digitalTwinUri;
}

export default function EchoesHdtListWidget({
  items,
  loading,
  error,
  visible,
  onRefresh,
}: EchoesHdtListWidgetProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h3 className="h6 text-secondary mb-0">Active ECCCH HDTs</h3>
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
        Digital Twins from `/api/eccch/hdts` that still have at least one active named graph in ECCCH.
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
              <div key={item.digitalTwinUri} className="list-group-item bg-transparent">
                <div className="fw-semibold text-break">{getItemTitle(item)}</div>
                <div className="small text-muted mt-2">Digital Twin</div>
                <div className="small text-break">{item.digitalTwinUri}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 small text-muted">
            {loading ? 'Loading active ECCCH HDTs...' : 'No active ECCCH HDTs found.'}
          </div>
        )}
      </div>
    </div>
  );
}
