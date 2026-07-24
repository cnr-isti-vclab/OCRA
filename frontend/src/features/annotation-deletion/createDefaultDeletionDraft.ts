import type { AnnotationDeletionDraft } from './types';

export function createDefaultDeletionDraft(): AnnotationDeletionDraft {
  return {
    step: 'setup',
    // Intent is chosen by the setup grid; placeholders until a preset is pressed.
    deleteLink: false,
    deleteGeometry: false,
    deleteData: false,
    candidateLinkIds: [],
    candidateGeometryIds: [],
    candidateDataIds: [],
    selectionMessage: null,
    pendingResolution: null,
  };
}
