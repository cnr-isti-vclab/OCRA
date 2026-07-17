import type { AnnotationDeletionDraft } from './types';

export function createDefaultDeletionDraft(): AnnotationDeletionDraft {
  return {
    step: 'setup',
    deleteLink: true,
    deleteGeometry: false,
    deleteData: false,
    candidateLinkIds: [],
    candidateGeometryIds: [],
    candidateDataIds: [],
  };
}
