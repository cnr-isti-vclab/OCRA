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
  /** Previous viewer selection ids (for ctrl multi-select diffs). */
  previousSelectedIds: readonly string[];
  /** Geometries linked to the pending data endpoint. */
  allowedGeometryIds: ReadonlySet<string>;
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
 * Apply viewer geometry picks while resolving data-led Let-me-select (M3).
 * Updates pending `selectedCounterpartIds` only — does not touch the basket.
 *
 * Toggle diffs are applied against the authoritative pending selection (not a
 * stale mix of basket highlights), so ctrl+click stays stable when the basket
 * already has other data.
 *
 * @returns The next counterpart selection (for viewer previousSelected tracking).
 */
export function applyDeletionCounterpartGeometryPicks(
  geometryIds: string[],
  draft: AnnotationDeletionDraft,
  actions: DeletionCounterpartGeometryPickActions,
  lockContext: LockContext,
  options: DeletionCounterpartGeometryPickOptions,
): string[] {
  const pending = draft.pendingResolution;
  if (
    !pending
    || pending.modal !== 'pickCounterparts'
    || pending.endpointKind !== 'data'
  ) {
    return [];
  }

  const allowed = options.allowedGeometryIds;
  const filterAllowed = (ids: readonly string[]) => ids.filter((id) => allowed.has(id));

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
    for (const geometryId of filterAllowed(geometryIds)) {
      tryInclude(geometryId, next);
    }
    const nextIds = [...next];
    actions.setDeletionCounterpartSelection(nextIds);
    return nextIds;
  }

  // Authoritative pending picks — ignore basket geometries that may linger in
  // previousSelectedIds from before pick mode started.
  const next = new Set(pending.selectedCounterpartIds);
  const previousViewer = filterAllowed(options.previousSelectedIds);
  const nextViewer = filterAllowed(geometryIds);

  if (nextViewer.length === 0) {
    actions.setDeletionCounterpartSelection([]);
    return [];
  }

  const { added, removed } = selectionDiff(previousViewer, nextViewer);
  for (const geometryId of removed) {
    next.delete(geometryId);
  }
  for (const geometryId of added) {
    tryInclude(geometryId, next);
  }

  // OpenLime may re-emit the same single selection on ctrl+click without a diff.
  if (
    added.length === 0
    && removed.length === 0
    && nextViewer.length === 1
    && next.has(nextViewer[0]!)
  ) {
    next.delete(nextViewer[0]!);
  }

  const nextIds = [...next];
  actions.setDeletionCounterpartSelection(nextIds);
  return nextIds;
}
