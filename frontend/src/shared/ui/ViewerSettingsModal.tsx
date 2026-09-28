import type { OpenLimeLabelVisibility } from '../../adapters/annotation-store/openlimeAnnotationAdapter';

interface ViewerSettingsModalProps {
  isOpen: boolean;
  labelVisibility: OpenLimeLabelVisibility;
  onLabelVisibilityChange: (mode: OpenLimeLabelVisibility) => void;
  acquisitionLightsAvailable: boolean;
  showAcquisitionLights: boolean;
  onShowAcquisitionLightsChange: (show: boolean) => void;
  onClose: () => void;
}

const LABEL_VISIBILITY_OPTIONS: Array<{
  value: OpenLimeLabelVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'selected',
    label: 'Selected',
    description: 'Show labels only for the currently selected annotations.',
  },
  {
    value: 'all',
    label: 'All',
    description: 'Show labels for every visible annotation.',
  },
  {
    value: 'none',
    label: 'None',
    description: 'Hide annotation labels in the viewer.',
  },
];

export default function ViewerSettingsModal({
  isOpen,
  labelVisibility,
  onLabelVisibilityChange,
  acquisitionLightsAvailable,
  showAcquisitionLights,
  onShowAcquisitionLightsChange,
  onClose,
}: ViewerSettingsModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header border-0 pb-0">
            <div>
              <h5 className="modal-title">Viewer settings</h5>
              <p className="text-muted small mb-0 mt-1">
                Configure how annotations are presented in the 2D viewer.
              </p>
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body pt-3">
            <div className="mb-2">
              <div className="fw-semibold text-dark">Label visibility</div>
              <div className="text-muted small">
                Choose when annotation labels should be displayed.
              </div>
            </div>
            <div className="list-group">
              {LABEL_VISIBILITY_OPTIONS.map((option) => {
                const checked = labelVisibility === option.value;
                return (
                  <label
                    key={option.value}
                    className={`list-group-item list-group-item-action ${checked ? 'active border-primary' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex align-items-start gap-3">
                      <input
                        className="form-check-input mt-1"
                        type="radio"
                        name="viewer-label-visibility"
                        checked={checked}
                        onChange={() => onLabelVisibilityChange(option.value)}
                      />
                      <div className="flex-grow-1">
                        <div className={`fw-semibold ${checked ? 'text-white' : 'text-dark'}`}>
                          {option.label}
                        </div>
                        <div className={`small ${checked ? 'text-white-50' : 'text-muted'}`}>
                          {option.description}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <section className="mt-4" aria-labelledby="viewer-light-settings-title">
              <div className="mb-2">
                <div id="viewer-light-settings-title" className="fw-semibold text-dark">Light</div>
                <div className="text-muted small">Show the directions used to acquire the active RTI dataset.</div>
              </div>
              <label className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" checked={showAcquisitionLights} disabled={!acquisitionLightsAvailable} onChange={(event) => onShowAcquisitionLightsChange(event.target.checked)} />
                <span className="form-check-label">Show acquisition lights</span>
              </label>
              {!acquisitionLightsAvailable ? <div className="text-muted small mt-2">No acquisition light positions are available for the selected lens mode.</div> : null}
            </section>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
