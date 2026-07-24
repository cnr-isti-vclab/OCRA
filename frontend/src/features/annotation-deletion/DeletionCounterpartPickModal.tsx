export interface DeletionCounterpartOption {
  id: string;
  label: string;
}

interface DeletionCounterpartPickModalProps {
  /** Geometry-led checklist of linked data rows. */
  endpointLabel: string;
  options: DeletionCounterpartOption[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Geometry-led Let-me-select: checklist of linked data (selection happens in the modal).
 * Data-led geometry picking uses {@link DeletionGeometryPickBar} instead (viewer must stay free).
 */
export default function DeletionCounterpartPickModal({
  endpointLabel,
  options,
  selectedIds,
  onToggle,
  onConfirm,
  onCancel,
}: DeletionCounterpartPickModalProps) {
  const selected = new Set(selectedIds);

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
              Select data records
            </h5>
          </div>
          <div className="modal-body">
            <p className="small text-muted">
              Choose which data records linked to
              {' '}
              <strong>{endpointLabel}</strong>
              {' '}
              should be included.
            </p>
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
