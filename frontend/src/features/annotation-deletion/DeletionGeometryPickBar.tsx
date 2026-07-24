interface DeletionGeometryPickBarProps {
  selectedCount: number;
  endpointLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Non-modal chrome for data-led Let-me-select (viewer stays interactive).
 * Sits in viewer panel chrome (bottom), not as a blocking dialog.
 */
export default function DeletionGeometryPickBar({
  selectedCount,
  endpointLabel,
  onConfirm,
  onCancel,
}: DeletionGeometryPickBarProps) {
  return (
    <div
      className="d-flex align-items-center gap-2 px-3 py-2 rounded shadow-sm border bg-body"
      role="region"
      aria-label="Select geometries for deletion"
    >
      <span className="small text-nowrap" aria-live="polite">
        {selectedCount === 0
          ? (
            <>
              Select geometries for
              {' '}
              <strong>{endpointLabel}</strong>
            </>
          )
          : (
            <>
              {selectedCount}
              {' '}
              geometr
              {selectedCount === 1 ? 'y' : 'ies'}
              {' '}
              selected
            </>
          )}
      </span>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={selectedCount === 0}
        onClick={onConfirm}
      >
        OK
      </button>
    </div>
  );
}
