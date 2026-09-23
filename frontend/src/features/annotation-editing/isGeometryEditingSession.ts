import type { AnnotationMode } from '../annotation-modes/resolveAnnotationMode';

/** Inspection focus is not an edit; publish geometry editor locks only while vertex editing is active. */
export function isGeometryEditingSession(input: {
  annotationMode: AnnotationMode;
  geometryEditingActive: boolean;
  creationActive: boolean;
  deletionActive: boolean;
}): boolean {
  return input.annotationMode === 'edit'
    && input.geometryEditingActive
    && !input.creationActive
    && !input.deletionActive;
}
