import type { AnnotationSocialLockState } from 'shared/annotation-events';
import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';
import {
  deselectDataFromDeletionBasket,
  deselectGeometryFromDeletionBasket,
} from './deselectFromDeletionBasket';
import {
  isDataIdUnderRemoteEditorLock,
  type AnnotationLinkRef,
} from '../../stores/annotation-social-locks';
import {
  isGeometryIdUnderRemoteEditorLock,
  isLinkIdUnderRemoteEditorLock,
} from './isEntityBlockedForDeletion';
import {
  nonErasableLinksForData,
  nonErasableLinksForGeometry,
} from './annotationDeletionCardinality';

export interface DeletionLockPruneContext {
  activeSocialLocks: readonly AnnotationSocialLockState[];
  currentStreamId: string | null;
  links: Iterable<AnnotationLink>;
  geometryIdsByDataId: ReadonlyMap<string, string[]>;
}

export interface DeletionLockPruneResult {
  draft: AnnotationDeletionDraft;
  removedLinkIds: string[];
  removedGeometryIds: string[];
  removedDataIds: string[];
  /** Human-readable skip summary, or null if nothing was pruned. */
  skipMessage: string | null;
}

function asLinkRefs(links: Iterable<AnnotationLink>): AnnotationLinkRef[] {
  return [...links].map((link) => ({
    id: link.id,
    geometryId: link.geometryId,
    dataId: link.dataId,
  }));
}

function formatSkipMessage(args: {
  removedLinkIds: string[];
  removedGeometryIds: string[];
  removedDataIds: string[];
}): string {
  const parts: string[] = [];
  if (args.removedGeometryIds.length > 0) {
    parts.push(
      `${args.removedGeometryIds.length} geometr${args.removedGeometryIds.length === 1 ? 'y' : 'ies'}`,
    );
  }
  if (args.removedDataIds.length > 0) {
    parts.push(`${args.removedDataIds.length} data`);
  }
  if (args.removedLinkIds.length > 0) {
    parts.push(
      `${args.removedLinkIds.length} link${args.removedLinkIds.length === 1 ? '' : 's'}`,
    );
  }
  return `Skipped ${parts.join(', ')} (being edited by another user).`;
}

/**
 * Drop remotely editor-locked basket entities and cascade dependents so the
 * remaining basket still satisfies the endpoint–link confirm rule.
 */
export function pruneLockedFromDeletionBasket(
  draft: AnnotationDeletionDraft,
  context: DeletionLockPruneContext,
): DeletionLockPruneResult {
  const linkList = [...context.links];
  const linkRefs = asLinkRefs(linkList);
  const before = {
    links: new Set(draft.candidateLinkIds),
    geometries: new Set(draft.candidateGeometryIds),
    data: new Set(draft.candidateDataIds),
  };

  let next: AnnotationDeletionDraft = { ...draft };

  const lockedGeometryIds = draft.candidateGeometryIds.filter((geometryId) => (
    isGeometryIdUnderRemoteEditorLock(
      geometryId,
      context.activeSocialLocks,
      context.currentStreamId,
      linkRefs,
    )
  ));
  for (const geometryId of lockedGeometryIds) {
    next = {
      ...next,
      ...deselectGeometryFromDeletionBasket(next, geometryId, linkList),
    };
  }

  const lockedDataIds = next.candidateDataIds.filter((dataId) => (
    isDataIdUnderRemoteEditorLock(
      dataId,
      context.activeSocialLocks,
      context.currentStreamId,
      context.geometryIdsByDataId,
      linkRefs,
    )
  ));
  for (const dataId of lockedDataIds) {
    next = {
      ...next,
      ...deselectDataFromDeletionBasket(next, dataId, linkList),
    };
  }

  const lockedLinkIds = next.candidateLinkIds.filter((linkId) => (
    isLinkIdUnderRemoteEditorLock(
      linkId,
      context.activeSocialLocks,
      context.currentStreamId,
      linkRefs,
    )
  ));
  if (lockedLinkIds.length > 0) {
    const removeLinks = new Set(lockedLinkIds);
    next = {
      ...next,
      candidateLinkIds: next.candidateLinkIds.filter((id) => !removeLinks.has(id)),
    };
  }

  // Drop endpoints that no longer have full link coverage after prune.
  const linkIdSet = new Set(next.candidateLinkIds);
  if (next.deleteGeometry) {
    next = {
      ...next,
      candidateGeometryIds: next.candidateGeometryIds.filter((geometryId) => {
        const incident = nonErasableLinksForGeometry(linkList, geometryId);
        if (incident.length === 0) {
          return true;
        }
        return incident.every((link) => linkIdSet.has(link.id));
      }),
    };
  }
  if (next.deleteData) {
    next = {
      ...next,
      candidateDataIds: next.candidateDataIds.filter((dataId) => {
        const incident = nonErasableLinksForData(linkList, dataId);
        if (incident.length === 0) {
          return true;
        }
        return incident.every((link) => linkIdSet.has(link.id));
      }),
    };
  }

  // Link-only: never keep endpoints.
  if (next.deleteLink && !next.deleteGeometry && !next.deleteData) {
    next = {
      ...next,
      candidateGeometryIds: [],
      candidateDataIds: [],
    };
  }

  const removedLinkIds = [...before.links].filter((id) => !next.candidateLinkIds.includes(id));
  const removedGeometryIds = [...before.geometries].filter((id) => !next.candidateGeometryIds.includes(id));
  const removedDataIds = [...before.data].filter((id) => !next.candidateDataIds.includes(id));
  const removedAnything =
    removedLinkIds.length > 0
    || removedGeometryIds.length > 0
    || removedDataIds.length > 0;

  return {
    draft: next,
    removedLinkIds,
    removedGeometryIds,
    removedDataIds,
    skipMessage: removedAnything
      ? formatSkipMessage({ removedLinkIds, removedGeometryIds, removedDataIds })
      : null,
  };
}
