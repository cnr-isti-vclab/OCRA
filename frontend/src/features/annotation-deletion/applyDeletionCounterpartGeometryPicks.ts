import type { AnnotationDeletionDraft } from './types';
import {
  DELETION_BLOCKED_BY_LOCK_MESSAGE,
  isEntityBlockedForDeletion,
  type DeletionLockCheckInput,
} from './isEntityBlockedForDeletion';

type LockContext = Omit<DeletionLockCheckInput, 'entityKind' | 'entityId'>;

export interface DeletionCounterpartGeometryPickActions {
  setDeletionCounterpartSelection: (counterpartIds: string[]) => void;
  reportDeletionSelectionBlocked: (message: string) => void;
}

export interface DeletionCounterpartGeometryPickOptions {
  /** Ctrl/Meta held — multi-select toggle. Without it, replace with a single selection. */
  toggle: boolean;
  previousSelectedIds: readonly string[];
  /** Geometries linked to the pending data endpoint. */
  allowedGeometryIds: ReadonlySet<string>;
}

/**
 * Apply viewer geometry picks while resolving data-led Let-me-select (M3).
 * Updates pending `selectedCounterpartIds` only — does not touch the basket.
 */
export function applyDeletionCounterpartGeometryPicks(
  geometryIds: string[],
  draft: AnnotationDeletionDraft,
  actions: DeletionCounterpartGeometryPickActions,
  lockContext: LockContext,
  options: DeletionCounterpartGeometryPickOptions,
): void {
  const pending = draft.pendingResolution;
  if (
    !pending
    || pending.modal !== 'pickCounterparts'
    || pending.endpointKind !== 'data'
  ) {
    return;
  }

  const allowed = options.allowedGeometryIds;
  const current = new Set(pending.selectedCounterpartIds);

  const tryInclude = (geometryId: string, into: Set<string>): void => {
    if (!allowed.has(geometryId)) {
      return;
    }
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
    into.add(geometryId);
  };

  if (!options.toggle) {
    const next = new Set<string>();
    for (const geometryId of geometryIds) {
      tryInclude(geometryId, next);
    }
    actions.setDeletionCounterpartSelection([...next]);
    return;
  }

  if (geometryIds.length === 0) {
    actions.setDeletionCounterpartSelection([]);
    return;
  }

  const prevSet = new Set(options.previousSelectedIds);
  const nextSet = new Set(geometryIds);
  const next = new Set(current);

  for (const geometryId of options.previousSelectedIds) {
    if (!nextSet.has(geometryId) && allowed.has(geometryId)) {
      next.delete(geometryId);
    }
  }
  for (const geometryId of geometryIds) {
    if (!prevSet.has(geometryId)) {
      tryInclude(geometryId, next);
    }
  }

  // OpenLime may re-emit the same single selection on ctrl+click without a diff.
  if (
    geometryIds.length === 1
    && prevSet.has(geometryIds[0]!)
    && nextSet.has(geometryIds[0]!)
    && current.has(geometryIds[0]!)
  ) {
    next.delete(geometryIds[0]!);
  }

  actions.setDeletionCounterpartSelection([...next]);
}
