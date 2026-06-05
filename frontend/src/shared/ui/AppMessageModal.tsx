import type { MessageModalDescriptor } from './AppMessageModalModel';

interface AppMessageModalProps {
  descriptor: MessageModalDescriptor | null;
  onClose?: () => void;
  onAction?: (actionKey: string) => void;
}

function toneClass(tone: MessageModalDescriptor['tone']): string {
  switch (tone) {
    case 'success':
      return 'text-bg-success';
    case 'warning':
      return 'text-bg-warning';
    case 'error':
      return 'text-bg-danger';
    case 'info':
    default:
      return 'text-bg-info';
  }
}

export default function AppMessageModal({ descriptor, onClose, onAction }: AppMessageModalProps) {
  if (!descriptor) {
    return null;
  }

  const handleAction = (actionKey: string) => {
    if (actionKey === 'close' && onClose) {
      onClose();
      return;
    }

    if (onAction) {
      onAction(actionKey);
      return;
    }

    if (onClose) {
      onClose();
    }
  };

  const handleBackdropClose = () => {
    if (!descriptor.dismissOnBackdrop) {
      return;
    }
    handleAction('close');
  };

  const buttonClass = (tone: 'primary' | 'secondary' | 'danger' | undefined) => {
    if (tone === 'secondary') {
      return 'btn btn-secondary';
    }
    if (tone === 'danger') {
      return 'btn btn-danger';
    }
    return 'btn btn-primary';
  };

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={handleBackdropClose}
    >
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{descriptor.title}</h5>
            <span className={`badge ms-auto ${toneClass(descriptor.tone)}`}>
              {descriptor.tone.toUpperCase()}
            </span>
          </div>
          <div className="modal-body">
            <p className="mb-0">{descriptor.message}</p>
            {descriptor.details.length > 0 && (
              <ul className="small mt-3 mb-0">
                {descriptor.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-footer">
            {descriptor.actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={buttonClass(action.tone)}
                onClick={() => {
                  handleAction(action.key);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
