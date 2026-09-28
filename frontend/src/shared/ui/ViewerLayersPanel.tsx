import './ViewerLayersPanel.css';

export interface ViewerBackgroundLayer {
  id: string;
  label: string;
  visible: boolean;
  modes: string[];
  mode: string | null;
}

export interface ViewerLensLayer {
  id: string;
  label: string;
}

interface ViewerLayersPanelProps {
  open: boolean;
  backgroundLayers: ViewerBackgroundLayer[];
  lensLayers: ViewerLensLayer[];
  lensEnabled: boolean;
  activeLensId: string | null;
  onClose: () => void;
  onBackgroundVisibilityChange: (id: string, visible: boolean) => void;
  onBackgroundModeChange: (id: string, mode: string) => void;
  onLensEnabledChange: (enabled: boolean) => void;
  onActiveLensChange: (id: string) => void;
}

/** Reusable application-owned layer controls, independent from a renderer UI. */
export default function ViewerLayersPanel({ open, backgroundLayers, lensLayers, lensEnabled, activeLensId, onClose, onBackgroundVisibilityChange, onBackgroundModeChange, onLensEnabledChange, onActiveLensChange }: ViewerLayersPanelProps) {
  if (!open) return null;
  return (
    <section className="ocra-viewer-layers" aria-label="Viewer layers">
      <header className="ocra-viewer-layers__header">
        <div><strong>Layers</strong><span>Display configuration</span></div>
        <button type="button" aria-label="Close layers" onClick={onClose}>×</button>
      </header>
      <section className="ocra-viewer-layers__section">
        <h3>Background</h3>
        {backgroundLayers.length === 0 ? <p>No background layers</p> : null}
        {backgroundLayers.map((layer) => (
          <div className="ocra-viewer-layers__row" key={layer.id}>
            <label className="form-check form-switch ocra-viewer-layers__toggle">
              <input className="form-check-input" type="checkbox" checked={layer.visible} onChange={(event) => onBackgroundVisibilityChange(layer.id, event.target.checked)} />
              <span>{layer.label}</span>
            </label>
            {layer.modes.length > 1 ? (
              <select aria-label={`${layer.label} rendering mode`} value={layer.mode ?? layer.modes[0]} onChange={(event) => onBackgroundModeChange(layer.id, event.target.value)}>
                {layer.modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </section>
      <section className="ocra-viewer-layers__section">
        <h3>Lens</h3>
        <label className="form-check form-switch ocra-viewer-layers__toggle ocra-viewer-layers__lens-enable">
          <input className="form-check-input" type="checkbox" checked={lensEnabled} disabled={lensLayers.length === 0} onChange={(event) => onLensEnabledChange(event.target.checked)} />
          <span>Enable inspection lens</span>
        </label>
        {lensLayers.length === 0 ? <p>No relightable layers available</p> : null}
        {lensLayers.length > 0 ? (
          <label className="ocra-viewer-layers__mode-select">
            <span>Mode</span>
            <select
              value={activeLensId ?? lensLayers[0].id}
              disabled={!lensEnabled}
              onChange={(event) => onActiveLensChange(event.target.value)}
            >
              {lensLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>{layer.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </section>
    </section>
  );
}
