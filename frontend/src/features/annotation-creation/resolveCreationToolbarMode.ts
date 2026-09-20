import type { AnnotationToolbarMode } from '../../components/AnnotationToolbar';

/** Resolve the 2D/3D toolbar mode; drawing is allowed only for a new geometry draft. */
export function resolveCreationToolbarMode(
  currentMode: AnnotationToolbarMode,
  options: {
    isCreationGeometryNew: boolean;
    isCreationGeometrySearch: boolean;
    /** When true, a draft shape exists and edit/replace is allowed. */
    hasDraftGeometry?: boolean;
    defaultCreateMode?: AnnotationToolbarMode;
  },
): AnnotationToolbarMode {
  if (options.isCreationGeometryNew) {
    if (options.hasDraftGeometry) {
      return currentMode;
    }
    if (currentMode === 'edit') {
      return options.defaultCreateMode ?? 'area';
    }
    return currentMode;
  }
  if (options.isCreationGeometrySearch) {
    return 'edit';
  }
  return 'edit';
}

export function creationToolbarDisabledModes(
  isCreationGeometryNew: boolean,
  isCreationGeometrySearch: boolean,
  hasDraftGeometry = false,
): AnnotationToolbarMode[] {
  if (isCreationGeometryNew) {
    return hasDraftGeometry ? [] : ['edit'];
  }
  if (isCreationGeometrySearch) {
    return ['point', 'line', 'area'];
  }
  return [];
}
