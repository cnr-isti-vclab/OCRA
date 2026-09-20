import type { AnnotationMode } from '../annotation-modes/resolveAnnotationMode';

/** Inspection focus is not an edit; publish geometry editor locks only for an active pencil session. */
export function isGeometryEditingSession(input: {
  annotationMode: AnnotationMode;
  pencilActive: boolean;
  creationActive: boolean;
  deletionActive: boolean;
}): boolean {
  return input.annotationMode === 'edit'
    && input.pencilActive
    && !input.creationActive
    && !input.deletionActive;
}
