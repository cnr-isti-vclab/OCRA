import type { AnnotationToolbarMode } from '../../components/AnnotationToolbar';

export function resolveCreationToolbarMode(
  currentMode: AnnotationToolbarMode,
  options: {
    isCreationGeometryNew: boolean;
    isCreationGeometrySearch: boolean;
    defaultCreateMode?: AnnotationToolbarMode;
  },
): AnnotationToolbarMode {
  if (options.isCreationGeometryNew) {
    if (currentMode === 'edit') {
      return options.defaultCreateMode ?? 'area';
    }
    return currentMode;
  }
  if (options.isCreationGeometrySearch) {
    return 'edit';
  }
  return currentMode;
}

export function creationToolbarDisabledModes(
  isCreationGeometryNew: boolean,
  isCreationGeometrySearch: boolean,
): AnnotationToolbarMode[] {
  if (isCreationGeometryNew) {
    return ['edit'];
  }
  if (isCreationGeometrySearch) {
    return ['point', 'line', 'area'];
  }
  return [];
}
