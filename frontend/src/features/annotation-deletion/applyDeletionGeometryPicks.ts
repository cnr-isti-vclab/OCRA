import type { AnnotationDeletionDraft } from './types';
import type { DeletionBasketAddResult } from '../../stores/AnnotationStore';
import {
  DELETION_BLOCKED_BY_LOCK_MESSAGE,
  isEntityBlockedForDeletion,
  type DeletionLockCheckInput,
} from './isEntityBlockedForDeletion';

type LockContext = Omit<DeletionLockCheckInput, 'entityKind' | 'entityId'>;

/**
 * Apply viewer geometry picks to the deletion basket (M2: 1:1 only).
 * Returns the last failure message, if any.
 */
export function applyDeletionGeometryPicks(
  geometryIds: string[],
  draft: AnnotationDeletionDraft,
  actions: {
    addGeometryToDeletionBasket: (geometryId: string) => DeletionBasketAddResult;
    addLinkOnlyFromEndpoint: (
      endpointKind: 'geometry' | 'data',
      endpointId: string,
    ) => DeletionBasketAddResult;
    reportDeletionSelectionBlocked: (message: string) => void;
  },
  lockContext: LockContext,
): void {
  const isLinkOnly = draft.deleteLink && !draft.deleteGeometry && !draft.deleteData;
  if (!isLinkOnly && !draft.deleteGeometry) {
    return;
  }

  for (const geometryId of geometryIds) {
    if (
      isEntityBlockedForDeletion({
        entityKind: 'geometry',
        entityId: geometryId,
        ...lockContext,
      })
    ) {
      actions.reportDeletionSelectionBlocked(DELETION_BLOCKED_BY_LOCK_MESSAGE);
      continue;
    }

    if (isLinkOnly) {
      actions.addLinkOnlyFromEndpoint('geometry', geometryId);
    } else {
      actions.addGeometryToDeletionBasket(geometryId);
    }
  }
}
