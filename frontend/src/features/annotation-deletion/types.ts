/**
 * Draft types for the annotation deletion wizard (M1+).
 * @see doc/a08-annotation-deletion.md
 */

export type AnnotationDeletionStep = 'setup' | 'selecting' | 'committing';

/** Valid delete-intent flags (Link always on for the four setup presets). */
export interface AnnotationDeletionIntent {
  deleteLink: boolean;
  deleteGeometry: boolean;
  deleteData: boolean;
}

export interface AnnotationDeletionDraft extends AnnotationDeletionIntent {
  step: AnnotationDeletionStep;
  candidateLinkIds: string[];
  candidateGeometryIds: string[];
  candidateDataIds: string[];
  /** Last selection feedback (e.g. no links / many links / lock). */
  selectionMessage: string | null;
}
