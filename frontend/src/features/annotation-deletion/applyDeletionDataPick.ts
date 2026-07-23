import type { AnnotationDeletionDraft } from './types';
import type { DeletionBasketAddResult } from '../../stores/AnnotationStore';
import {
  DELETION_BLOCKED_BY_LOCK_MESSAGE,
  isEntityBlockedForDeletion,
  type DeletionLockCheckInput,
} from './isEntityBlockedForDeletion';
import {
  isDataHighlightedForDeletion,
  resolveDeletionHighlightIds,
} from './resolveDeletionHighlightIds';
import type { AnnotationLink } from 'shared/annotation-types';

type LockContext = Omit<DeletionLockCheckInput, 'entityKind' | 'entityId'>;

export interface DeletionDataPickActions {
  addDataToDeletionBasket: (dataId: string) => DeletionBasketAddResult;
  addLinkOnlyFromEndpoint: (
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ) => DeletionBasketAddResult;
  deselectDataFromDeletionBasket: (dataId: string) => void;
  reportDeletionSelectionBlocked: (message: string) => void;
}

/**
 * Apply a panel data pick to the deletion basket.
 * Plain click = single-select replace; Ctrl/Meta = multi-select toggle.
 *
 * Counterpart data in Link+Geo are highlight-only (not selectable/deselectable).
 */
export function applyDeletionDataPick(
  dataId: string,
  draft: AnnotationDeletionDraft,
  actions: DeletionDataPickActions,
  lockContext: LockContext,
  options: { toggle: boolean; links: Iterable<AnnotationLink> },
): void {
  const isLinkOnly = draft.deleteLink && !draft.deleteGeometry && !draft.deleteData;
  if (!isLinkOnly && !draft.deleteData && !draft.deleteGeometry) {
    return;
  }
  // Link+Geo: data rows are link counterparts — visible only, not interactive.
  if (!isLinkOnly && !draft.deleteData) {
    return;
  }

  const addOne = () => {
    if (
      isEntityBlockedForDeletion({
        entityKind: 'data',
        entityId: dataId,
        ...lockContext,
      })
    ) {
      actions.reportDeletionSelectionBlocked(DELETION_BLOCKED_BY_LOCK_MESSAGE);
      return;
    }
    if (isLinkOnly) {
      actions.addLinkOnlyFromEndpoint('data', dataId);
      return;
    }
    if (draft.deleteData) {
      actions.addDataToDeletionBasket(dataId);
    }
  };

  if (options.toggle) {
    if (isDataHighlightedForDeletion(dataId, draft, options.links)) {
      actions.deselectDataFromDeletionBasket(dataId);
      return;
    }
    addOne();
    return;
  }

  // Single-select: keep only this data id; drop other highlighted data.
  const currentlyHighlighted = resolveDeletionHighlightIds(draft, options.links).dataIds;
  for (const otherId of currentlyHighlighted) {
    if (otherId !== dataId) {
      actions.deselectDataFromDeletionBasket(otherId);
    }
  }
  if (!isDataHighlightedForDeletion(dataId, draft, options.links)) {
    addOne();
  }
}
