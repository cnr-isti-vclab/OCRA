export interface DeletionCounterpartOption {
  id: string;
  label: string;
}

interface DeletionCounterpartPickModalProps {
  /** Geometry-led → pick data; data-led → pick geometries (viewer or list). */
  endpointKind: 'geometry' | 'data';
  endpointLabel: string;
  options: DeletionCounterpartOption[];
  selectedIds: readonly string[];
  /**
   * When true (data-led geometry pick), selection happens in the viewer;
   * the modal only confirms OK/Cancel and lists current picks.
   */
  viewerPickMode?: boolean;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeletionCounterpartPickModal({
  endpointKind,
  endpointLabel,
  options,
  selectedIds,
  viewerPickMode = false,
  onToggle,
  onConfirm,
  onCancel,
}: DeletionCounterpartPickModalProps) {
  const selected = new Set(selectedIds);
  const counterpartLabel = endpointKind === 'geometry' ? 'data records' : 'geometries';

  return (
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-counterpart-pick-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="deletion-counterpart-pick-title">
              Select
              {' '}
              {counterpartLabel}
            </h5>
          </div>
          <div className="modal-body">
            <p className="small text-muted">
              {viewerPickMode
                ? (
                  <>
                    Select the geometries linked to
                    {' '}
                    <strong>{endpointLabel}</strong>
                    {' '}
                    in the viewer, then press OK.
                  </>
                )
                : (
                  <>
                    Choose which
                    {' '}
                    {counterpartLabel}
                    {' '}
                    linked to
                    {' '}
                    <strong>{endpointLabel}</strong>
                    {' '}
                    should be included.
                  </>
                )}
            </p>
            {viewerPickMode ? (
              <p className="mb-0 small">
                {selectedIds.length === 0
                  ? 'No geometries selected yet.'
                  : `${selectedIds.length} geometr${selectedIds.length === 1 ? 'y' : 'ies'} selected.`}
              </p>
            ) : (
              <div className="list-group">
                {options.map((option) => (
                  <label
                    key={option.id}
                    className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="form-check-input m-0"
                      checked={selected.has(option.id)}
                      onChange={() => onToggle(option.id)}
                    />
                    <span className="text-truncate">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedIds.length === 0}
              onClick={onConfirm}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
