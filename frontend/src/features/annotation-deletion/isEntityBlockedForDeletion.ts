import type { AnnotationSocialLockState } from 'shared/annotation-events';
import type { AnnotationLinkRef } from '../../stores/annotation-social-locks';
import {
  isDataIdUnderRemoteEditorLock,
} from '../../stores/annotation-social-locks';

function isRemoteEditorLock(lock: AnnotationSocialLockState, currentStreamId: string | null): boolean {
  if (lock.lockKind !== 'editor' || !lock.resourceType || !lock.resourceId) {
    return false;
  }
  if (currentStreamId && lock.streamId === currentStreamId) {
    return false;
  }
  return true;
}

export function isGeometryIdUnderRemoteEditorLock(
  geometryId: string,
  activeSocialLocks: readonly AnnotationSocialLockState[],
  currentStreamId: string | null,
  links: Iterable<AnnotationLinkRef>,
): boolean {
  const dataIds = new Set<string>();
  const linkIds = new Set<string>();
  for (const link of links) {
    if (link.geometryId !== geometryId) {
      continue;
    }
    dataIds.add(link.dataId);
    linkIds.add(link.id);
  }

  return activeSocialLocks.some((lock) => {
    if (!isRemoteEditorLock(lock, currentStreamId)) {
      return false;
    }
    if (lock.resourceType === 'geometry') {
      return lock.resourceId === geometryId;
    }
    if (lock.resourceType === 'data') {
      return dataIds.has(lock.resourceId!);
    }
    if (lock.resourceType === 'link') {
      return linkIds.has(lock.resourceId!);
    }
    return false;
  });
}

export function isLinkIdUnderRemoteEditorLock(
  linkId: string,
  activeSocialLocks: readonly AnnotationSocialLockState[],
  currentStreamId: string | null,
  links: Iterable<AnnotationLinkRef>,
): boolean {
  const link = [...links].find((entry) => entry.id === linkId);
  if (!link) {
    return activeSocialLocks.some(
      (lock) => isRemoteEditorLock(lock, currentStreamId)
        && lock.resourceType === 'link'
        && lock.resourceId === linkId,
    );
  }

  return activeSocialLocks.some((lock) => {
    if (!isRemoteEditorLock(lock, currentStreamId)) {
      return false;
    }
    if (lock.resourceType === 'link') {
      return lock.resourceId === linkId;
    }
    if (lock.resourceType === 'geometry') {
      return lock.resourceId === link.geometryId;
    }
    if (lock.resourceType === 'data') {
      return lock.resourceId === link.dataId;
    }
    return false;
  });
}

export interface DeletionLockCheckInput {
  entityKind: 'geometry' | 'data' | 'link';
  entityId: string;
  activeSocialLocks: readonly AnnotationSocialLockState[];
  currentStreamId: string | null;
  links: Iterable<AnnotationLinkRef>;
  geometryIdsByDataId: ReadonlyMap<string, string[]>;
}

/**
 * True when a remote editor social lock blocks adding this entity to the delete basket.
 */
export function isEntityBlockedForDeletion(input: DeletionLockCheckInput): boolean {
  const {
    entityKind,
    entityId,
    activeSocialLocks,
    currentStreamId,
    links,
    geometryIdsByDataId,
  } = input;

  if (entityKind === 'data') {
    return isDataIdUnderRemoteEditorLock(
      entityId,
      activeSocialLocks,
      currentStreamId,
      geometryIdsByDataId,
      links,
    );
  }
  if (entityKind === 'geometry') {
    return isGeometryIdUnderRemoteEditorLock(
      entityId,
      activeSocialLocks,
      currentStreamId,
      links,
    );
  }
  return isLinkIdUnderRemoteEditorLock(
    entityId,
    activeSocialLocks,
    currentStreamId,
    links,
  );
}

export const DELETION_BLOCKED_BY_LOCK_MESSAGE =
  'Cannot delete while another user is editing this annotation';

export const DELETION_MANY_LINKS_MESSAGE =
  'This item has multiple links. Multi-link selection lands in the next milestone.';

export const DELETION_NO_LINKS_MESSAGE =
  'No links are incident on this entry. Nothing was added.';
