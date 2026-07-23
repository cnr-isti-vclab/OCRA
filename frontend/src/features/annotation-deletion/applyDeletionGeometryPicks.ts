import type { AnnotationDeletionDraft } from './types';
import type { DeletionBasketAddResult } from '../../stores/AnnotationStore';
import {
  DELETION_BLOCKED_BY_LOCK_MESSAGE,
  isEntityBlockedForDeletion,
  type DeletionLockCheckInput,
} from './isEntityBlockedForDeletion';
import { isGeometryHighlightedForDeletion } from './resolveDeletionHighlightIds';
import type { AnnotationLink } from 'shared/annotation-types';

type LockContext = Omit<DeletionLockCheckInput, 'entityKind' | 'entityId'>;

export interface DeletionGeometryPickActions {
  addGeometryToDeletionBasket: (geometryId: string) => DeletionBasketAddResult;
  addLinkOnlyFromEndpoint: (
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ) => DeletionBasketAddResult;
  deselectGeometryFromDeletionBasket: (geometryId: string) => void;
  reportDeletionSelectionBlocked: (message: string) => void;
}

export interface DeletionGeometryPickOptions {
  /** Ctrl/Meta held — toggle/deselect instead of always adding. */
  toggle: boolean;
  /** Previous viewer selection ids (for ctrl multi-select diffs). */
  previousSelectedIds: readonly string[];
  links: Iterable<AnnotationLink>;
}

function selectionDiff(
  previous: readonly string[],
  next: readonly string[],
): { added: string[]; removed: string[] } {
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: previous.filter((id) => !nextSet.has(id)),
  };
}

/**
 * Apply viewer geometry picks to the deletion basket (M2: 1:1 only).
 * Plain click always adds; Ctrl/Meta toggles deselect with cascade rules.
 */
export function applyDeletionGeometryPicks(
  geometryIds: string[],
  draft: AnnotationDeletionDraft,
  actions: DeletionGeometryPickActions,
  lockContext: LockContext,
  options: DeletionGeometryPickOptions,
): void {
  const isLinkOnly = draft.deleteLink && !draft.deleteGeometry && !draft.deleteData;
  if (!isLinkOnly && !draft.deleteGeometry && !draft.deleteData) {
    return;
  }
  // Link+Data: geometries are only highlights via links — still allow ctrl deselect.
  if (!isLinkOnly && !draft.deleteGeometry && !options.toggle) {
    return;
  }

  const addOne = (geometryId: string) => {
    if (
      isEntityBlockedForDeletion({
        entityKind: 'geometry',
        entityId: geometryId,
        ...lockContext,
      })
    ) {
      actions.reportDeletionSelectionBlocked(DELETION_BLOCKED_BY_LOCK_MESSAGE);
      return;
    }
    if (isLinkOnly) {
      actions.addLinkOnlyFromEndpoint('geometry', geometryId);
      return;
    }
    if (draft.deleteGeometry) {
      actions.addGeometryToDeletionBasket(geometryId);
    }
  };

  const deselectOne = (geometryId: string) => {
    actions.deselectGeometryFromDeletionBasket(geometryId);
  };

  if (!options.toggle) {
    for (const geometryId of geometryIds) {
      addOne(geometryId);
    }
    return;
  }

  const { added, removed } = selectionDiff(options.previousSelectedIds, geometryIds);
  for (const geometryId of removed) {
    if (isGeometryHighlightedForDeletion(geometryId, draft, options.links)) {
      deselectOne(geometryId);
    }
  }
  for (const geometryId of added) {
    if (isGeometryHighlightedForDeletion(geometryId, draft, options.links)) {
      deselectOne(geometryId);
    } else {
      addOne(geometryId);
    }
  }
  // OpenLime may re-emit the same single selection on ctrl+click without a diff.
  if (
    added.length === 0
    && removed.length === 0
    && geometryIds.length === 1
    && isGeometryHighlightedForDeletion(geometryIds[0]!, draft, options.links)
  ) {
    deselectOne(geometryIds[0]!);
  }
}
