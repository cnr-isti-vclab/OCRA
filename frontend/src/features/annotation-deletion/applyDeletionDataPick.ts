import type { AnnotationDeletionDraft } from './types';
import type { DeletionBasketAddResult } from '../../stores/AnnotationStore';
import {
  DELETION_BLOCKED_BY_LOCK_MESSAGE,
  isEntityBlockedForDeletion,
  type DeletionLockCheckInput,
} from './isEntityBlockedForDeletion';
import { isDataHighlightedForDeletion } from './resolveDeletionHighlightIds';
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
 * Plain click always adds; Ctrl/Meta toggles deselect with cascade rules.
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
  // Link+Geo: data rows are only highlights via links — still allow ctrl deselect.
  if (!isLinkOnly && !draft.deleteData && !options.toggle) {
    return;
  }

  if (options.toggle && isDataHighlightedForDeletion(dataId, draft, options.links)) {
    actions.deselectDataFromDeletionBasket(dataId);
    return;
  }

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
}
