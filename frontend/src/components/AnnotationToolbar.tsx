/** Shared annotation drawing / edit modes for 2D and 3D viewers. */
export type AnnotationToolbarMode = 'point' | 'line' | 'area' | 'edit' | 'sam2';

export interface AnnotationToolbarProps {
  mode: AnnotationToolbarMode;
  onModeChange: (mode: AnnotationToolbarMode) => void;
  className?: string;
  disabled?: boolean;
  disabledModes?: ReadonlyArray<AnnotationToolbarMode>;
}

const TOOL_BUTTONS: ReadonlyArray<{
  mode: AnnotationToolbarMode;
  label: string;
  icon: string;
}> = [
  { mode: 'point', label: 'Point', icon: 'bi-record-circle' },
  { mode: 'line', label: 'Line', icon: 'bi-slash-lg' },
  { mode: 'area', label: 'Area', icon: 'bi-pentagon' },
  { mode: 'edit', label: 'Edit', icon: 'bi-pencil' },
  { mode: 'sam2', label: 'SAM2', icon: 'bi-magic' },
];

/** Reusable toolbar for choosing annotation geometry type or edit/select mode. */
export default function AnnotationToolbar({
  mode,
  onModeChange,
  className = '',
  disabled = false,
  disabledModes = [],
}: AnnotationToolbarProps) {
  return (
    <div
      className={`annotation-toolbar shadow ${className}`.trim()}
      role="toolbar"
      aria-label="Annotation tools"
      style={{
        display: 'inline-flex',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="btn-group" role="group">
        {TOOL_BUTTONS.map(({ mode: toolMode, label, icon }) => {
          const active = mode === toolMode;
          const disabledForMode = disabledModes.includes(toolMode);
          return (
            <button
              key={toolMode}
              type="button"
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-light'}`}
              onClick={() => onModeChange(toolMode)}
              disabled={disabled || disabledForMode}
              aria-pressed={active}
              title={label}
            >
              <i className={`bi ${icon} me-1`} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
