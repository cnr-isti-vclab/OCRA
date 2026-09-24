import type { AnnotationToolbarMode } from '../../components/AnnotationToolbar';

/**
 * Resolve the 2D/3D toolbar mode during geometry creation.
 * Sticky New keeps the drawing tool after each completed shape; Edit is allowed
 * only when drafts already exist and the user explicitly selected edit.
 */
export function resolveCreationToolbarMode(
  currentMode: AnnotationToolbarMode,
  options: {
    isCreationGeometryNew: boolean;
    isCreationGeometrySearch: boolean;
    /** When true, at least one draft shape exists (edit-last is allowed). */
    hasDraftGeometry?: boolean;
    defaultCreateMode?: AnnotationToolbarMode;
  },
): AnnotationToolbarMode {
  if (options.isCreationGeometryNew) {
    if (currentMode === 'point' || currentMode === 'line' || currentMode === 'area') {
      return currentMode;
    }
    // edit (or unknown): stay in edit only when a draft exists to tweak; otherwise draw.
    if (options.hasDraftGeometry && currentMode === 'edit') {
      return 'edit';
    }
    return options.defaultCreateMode ?? 'area';
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
