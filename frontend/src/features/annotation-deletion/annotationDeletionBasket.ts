import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';
import { validateDeletionSetup, type AnnotationDeletionValidationResult } from './annotationDeletionValidation';

export interface DeletionBasketContext {
  links: Iterable<AnnotationLink>;
}

/**
 * Confirm gating: non-empty basket, setup still valid.
 * Link selection is optional when an endpoint is being marked erasable. Any
 * remaining strong links retain that endpoint as a Ghost. Link-only operations
 * still require at least one selected relationship.
 */
export function validateDeletionBasket(
  draft: AnnotationDeletionDraft,
  _context: DeletionBasketContext,
): AnnotationDeletionValidationResult {
  const setup = validateDeletionSetup(draft);
  if (!setup.ok) {
    return setup;
  }

  if (draft.step !== 'selecting' && draft.step !== 'committing') {
    return { ok: false, message: 'Deletion selection is not active.' };
  }

  if (draft.pendingResolution) {
    return { ok: false, message: 'Resolve the multi-link selection before confirming.' };
  }

  const hasCandidates =
    draft.candidateLinkIds.length > 0
    || draft.candidateGeometryIds.length > 0
    || draft.candidateDataIds.length > 0;

  if (!hasCandidates) {
    return { ok: false, message: 'Select at least one item to delete.' };
  }

  if (draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
    if (draft.candidateLinkIds.length === 0) {
      return { ok: false, message: 'Select at least one link to delete.' };
    }
    if (draft.candidateGeometryIds.length > 0 || draft.candidateDataIds.length > 0) {
      return { ok: false, message: 'Link-only delete must not include geometry or data endpoints.' };
    }
  }

  if (!draft.deleteLink && draft.deleteGeometry && !draft.deleteData) {
    if (draft.candidateGeometryIds.length === 0) {
      return { ok: false, message: 'Select at least one geometry to delete.' };
    }
    if (draft.candidateLinkIds.length > 0 || draft.candidateDataIds.length > 0) {
      return { ok: false, message: 'Geometry-only delete must not include links or data.' };
    }
  }

  if (!draft.deleteLink && draft.deleteData && !draft.deleteGeometry) {
    if (draft.candidateDataIds.length === 0) {
      return { ok: false, message: 'Select at least one data record to delete.' };
    }
    if (draft.candidateLinkIds.length > 0 || draft.candidateGeometryIds.length > 0) {
      return { ok: false, message: 'Data-only delete must not include links or geometries.' };
    }
  }

  return { ok: true };
}

export function canConfirmDeletionBasket(
  draft: AnnotationDeletionDraft,
  context: DeletionBasketContext,
): boolean {
  return validateDeletionBasket(draft, context).ok;
}
