import type { AnnotationSocialLockState } from 'shared/annotation-events';

export interface AnnotationLinkRef {
  id: string;
  dataId: string;
  geometryId: string;
}

function isEditorLock(lock: AnnotationSocialLockState): boolean {
  return lock.lockKind === 'editor' && Boolean(lock.resourceType && lock.resourceId);
}

function isRemoteEditorLock(lock: AnnotationSocialLockState, currentStreamId: string | null): boolean {
  if (!isEditorLock(lock)) {
    return false;
  }
  if (currentStreamId && lock.streamId === currentStreamId) {
    return false;
  }
  return true;
}

/** Geometry and link ids tied to one annotation data row. */
export function linkedResourcesForData(
  dataId: string,
  geometryIdsByDataId: ReadonlyMap<string, string[]>,
  links: Iterable<AnnotationLinkRef>,
): { geometryIds: Set<string>; linkIds: Set<string> } {
  const geometryIds = new Set(geometryIdsByDataId.get(dataId) ?? []);
  const linkIds = new Set<string>();
  for (const link of links) {
    if (link.dataId !== dataId) {
      continue;
    }
    linkIds.add(link.id);
    geometryIds.add(link.geometryId);
  }
  return { geometryIds, linkIds };
}

/**
 * True when another user's editor social-lock covers this data row or a linked geometry/link.
 */
export function isDataIdUnderRemoteEditorLock(
  dataId: string,
  activeSocialLocks: readonly AnnotationSocialLockState[],
  currentStreamId: string | null,
  geometryIdsByDataId: ReadonlyMap<string, string[]>,
  links: Iterable<AnnotationLinkRef>,
): boolean {
  const { geometryIds, linkIds } = linkedResourcesForData(dataId, geometryIdsByDataId, links);

  return activeSocialLocks.some((lock) => {
    if (!isRemoteEditorLock(lock, currentStreamId)) {
      return false;
    }
    if (lock.resourceType === 'data') {
      return lock.resourceId === dataId;
    }
    if (lock.resourceType === 'geometry') {
      return geometryIds.has(lock.resourceId!);
    }
    if (lock.resourceType === 'link') {
      return linkIds.has(lock.resourceId!);
    }
    return false;
  });
}

export function areAnyDataIdsUnderRemoteEditorLock(
  dataIds: Iterable<string>,
  activeSocialLocks: readonly AnnotationSocialLockState[],
  currentStreamId: string | null,
  geometryIdsByDataId: ReadonlyMap<string, string[]>,
  links: Iterable<AnnotationLinkRef>,
): boolean {
  for (const dataId of dataIds) {
    if (
      isDataIdUnderRemoteEditorLock(
        dataId,
        activeSocialLocks,
        currentStreamId,
        geometryIdsByDataId,
        links,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Any editor lock (local or remote) on data or linked geometry/link — for panel “under editing” styling.
 */
export function isDataIdUnderEditorLock(
  dataId: string,
  activeSocialLocks: readonly AnnotationSocialLockState[],
  geometryIdsByDataId: ReadonlyMap<string, string[]>,
  links: Iterable<AnnotationLinkRef>,
): boolean {
  const { geometryIds, linkIds } = linkedResourcesForData(dataId, geometryIdsByDataId, links);

  return activeSocialLocks.some((lock) => {
    if (!isEditorLock(lock)) {
      return false;
    }
    if (lock.resourceType === 'data') {
      return lock.resourceId === dataId;
    }
    if (lock.resourceType === 'geometry') {
      return geometryIds.has(lock.resourceId!);
    }
    if (lock.resourceType === 'link') {
      return linkIds.has(lock.resourceId!);
    }
    return false;
  });
}
