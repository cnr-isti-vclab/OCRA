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

/**
 * Pending 1:N disambiguation while selecting (M3).
 * Kept on the draft so Cancel does not corrupt the committed basket.
 */
export type DeletionCardinalityModal = 'fanOut' | 'linkResolution' | 'pickCounterparts';

export interface DeletionPendingResolution {
  modal: DeletionCardinalityModal;
  endpointKind: 'geometry' | 'data';
  endpointId: string;
  /** Non-erasable incident links on the endpoint at resolution start. */
  incidentLinkIds: string[];
  /**
   * When modal is pickCounterparts: selected counterpart ids
   * (data ids if geometry-led; geometry ids if data-led).
   */
  selectedCounterpartIds: string[];
}

export interface AnnotationDeletionDraft extends AnnotationDeletionIntent {
  step: AnnotationDeletionStep;
  candidateLinkIds: string[];
  candidateGeometryIds: string[];
  candidateDataIds: string[];
  /** Last selection feedback (e.g. no links / lock). */
  selectionMessage: string | null;
  /** Active 1:N modal state, or null when none. */
  pendingResolution: DeletionPendingResolution | null;
}
