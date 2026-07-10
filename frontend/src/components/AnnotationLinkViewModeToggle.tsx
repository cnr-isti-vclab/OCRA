import type { AnnotationLinkViewMode } from '../features/annotation-link-view/annotationLinkViewMode';
import {
  ANNOTATION_LINK_VIEW_MODES,
  DEFAULT_ANNOTATION_LINK_VIEW_LABELS,
} from '../features/annotation-link-view/annotationLinkViewMode';

interface AnnotationLinkViewModeToggleProps {
  idPrefix: string;
  mode: AnnotationLinkViewMode;
  onChange: (mode: AnnotationLinkViewMode) => void;
  disabled?: boolean;
}

const MODE_TITLES: Record<AnnotationLinkViewMode, string> = {
  showAll: 'Show all geometries in the viewer and all data in the panel',
  selectGeometry: 'When a geometry is selected, show only linked data in the panel',
  selectData: 'When data is selected, show only linked geometries in the viewer',
};

export default function AnnotationLinkViewModeToggle({
  idPrefix,
  mode,
  onChange,
  disabled = false,
}: AnnotationLinkViewModeToggleProps) {
  return (
    <div className="mb-3">
      <div className="small text-muted mb-1">Link view</div>
      <div className="btn-group btn-group-sm w-100" role="group" aria-label="Annotation link view mode">
        {ANNOTATION_LINK_VIEW_MODES.map((option) => {
          const inputId = `${idPrefix}-link-view-${option}`;
          return (
            <span key={option} className="flex-fill">
              <input
                type="radio"
                className="btn-check"
                name={`${idPrefix}-link-view`}
                id={inputId}
                autoComplete="off"
                checked={mode === option}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              <label
                className="btn btn-outline-secondary w-100"
                htmlFor={inputId}
                title={MODE_TITLES[option]}
              >
                {DEFAULT_ANNOTATION_LINK_VIEW_LABELS[option]}
              </label>
            </span>
          );
        })}
      </div>
    </div>
  );
}
