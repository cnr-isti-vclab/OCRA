interface DeletionFanOutConfirmModalProps {
  endpointKind: 'geometry' | 'data';
  endpointLabel: string;
  linkCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeletionFanOutConfirmModal({
  endpointKind,
  endpointLabel,
  linkCount,
  onConfirm,
  onCancel,
}: DeletionFanOutConfirmModalProps) {
  const kindLabel = endpointKind === 'geometry' ? 'geometry' : 'data record';

  return (
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-fanout-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onCancel}
    >
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="deletion-fanout-title">
              One-to-many selection
            </h5>
          </div>
          <div className="modal-body">
            <p className="mb-2">
              The selected
              {' '}
              {kindLabel}
              {' '}
              <strong>{endpointLabel}</strong>
              {' '}
              has
              {' '}
              {linkCount}
              {' '}
              links. Do you want to delete it? All incoming links will be removed.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={onConfirm}>
              Yes, delete anyway
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
