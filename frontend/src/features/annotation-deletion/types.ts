/**
 * Draft types for the annotation deletion wizard (M1+).
 * @see doc/a08-annotation-deletion.md
 */

export type AnnotationDeletionStep = 'setup' | 'selecting' | 'committing';

export interface AnnotationDeletionDraft {
  step: AnnotationDeletionStep;
  deleteLink: boolean;
  deleteGeometry: boolean;
  deleteData: boolean;
  candidateLinkIds: string[];
  candidateGeometryIds: string[];
  candidateDataIds: string[];
  /** Last selection feedback (e.g. no links / many links / lock). */
  selectionMessage: string | null;
}
