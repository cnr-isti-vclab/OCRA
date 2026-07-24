import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';
import {
  nonErasableLinksForData,
  nonErasableLinksForGeometry,
} from './annotationDeletionCardinality';
import { validateDeletionSetup, type AnnotationDeletionValidationResult } from './annotationDeletionValidation';

export interface DeletionBasketContext {
  links: Iterable<AnnotationLink>;
}

/**
 * Confirm gating for M2: non-empty basket, setup still valid, and every
 * endpoint in the basket has all its scene-visible non-erasable links included.
 */
export function validateDeletionBasket(
  draft: AnnotationDeletionDraft,
  context: DeletionBasketContext,
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

  const linkIdSet = new Set(draft.candidateLinkIds);
  const links = [...context.links];

  if (draft.deleteGeometry) {
    for (const geometryId of draft.candidateGeometryIds) {
      const incident = nonErasableLinksForGeometry(links, geometryId);
      if (incident.length === 0) {
        return {
          ok: false,
          message: `Geometry ${geometryId} has no non-erasable links in this scene.`,
        };
      }
      if (incident.some((link) => !linkIdSet.has(link.id))) {
        return {
          ok: false,
          message: 'Every geometry in the basket must include all of its non-erasable links.',
        };
      }
    }
  }

  if (draft.deleteData) {
    for (const dataId of draft.candidateDataIds) {
      const incident = nonErasableLinksForData(links, dataId);
      if (incident.length === 0) {
        return {
          ok: false,
          message: `Data ${dataId} has no non-erasable links in this scene.`,
        };
      }
      if (incident.some((link) => !linkIdSet.has(link.id))) {
        return {
          ok: false,
          message: 'Every data record in the basket must include all of its non-erasable links.',
        };
      }
    }
  }

  if (draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
    if (draft.candidateLinkIds.length === 0) {
      return { ok: false, message: 'Select at least one link to delete.' };
    }
    if (draft.candidateGeometryIds.length > 0 || draft.candidateDataIds.length > 0) {
      return { ok: false, message: 'Link-only delete must not include geometry or data endpoints.' };
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
