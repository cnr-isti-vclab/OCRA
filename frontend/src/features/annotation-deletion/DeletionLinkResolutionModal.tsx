interface DeletionLinkResolutionModalProps {
  endpointKind: 'geometry' | 'data';
  endpointLabel: string;
  linkCount: number;
  onAll: () => void;
  onNone: () => void;
  onLetMeSelect: () => void;
}

export default function DeletionLinkResolutionModal({
  endpointKind,
  endpointLabel,
  linkCount,
  onAll,
  onNone,
  onLetMeSelect,
}: DeletionLinkResolutionModalProps) {
  const kindLabel = endpointKind === 'geometry' ? 'geometry' : 'data record';

  return (
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-link-resolution-title"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onNone}
    >
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="deletion-link-resolution-title">
              Select links to delete
            </h5>
          </div>
          <div className="modal-body">
            <p className="mb-0">
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
              links. Select which links you want to delete.
            </p>
          </div>
          <div className="modal-footer flex-wrap gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={onNone}>
              None
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={onLetMeSelect}>
              Let me select
            </button>
            <button type="button" className="btn btn-danger" onClick={onAll}>
              All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
