import type { AnnotationLink } from 'shared/annotation-types';
import type {
  AnnotationDeletionDraft,
  AnnotationDeletionIntent,
  DeletionCardinalityModal,
  DeletionPendingResolution,
} from './types';
import {
  isOneToManyLinks,
  nonErasableLinksForData,
  nonErasableLinksForGeometry,
} from './annotationDeletionCardinality';

export type DeletionCardinalityKind = 'fanOut' | 'linkResolution' | null;

/**
 * Which 1:N modal applies for the current intent when an endpoint has N links.
 * @see doc/a08-annotation-deletion.md — Which modal applies
 */
export function resolveDeletionCardinalityModal(
  intent: AnnotationDeletionIntent,
): DeletionCardinalityKind {
  const { deleteLink, deleteGeometry, deleteData } = intent;
  if (!deleteLink) {
    return null;
  }
  // Link-only → link resolution
  if (!deleteGeometry && !deleteData) {
    return 'linkResolution';
  }
  // Full triplet → link resolution
  if (deleteGeometry && deleteData) {
    return 'linkResolution';
  }
  // Exactly one endpoint type → fan-out warning
  if (deleteGeometry !== deleteData) {
    return 'fanOut';
  }
  return null;
}

export function buildPendingResolution(
  endpointKind: 'geometry' | 'data',
  endpointId: string,
  incident: readonly AnnotationLink[],
  modal: DeletionCardinalityModal,
): DeletionPendingResolution {
  return {
    modal,
    endpointKind,
    endpointId,
    incidentLinkIds: incident.map((link) => link.id),
    selectedCounterpartIds: [],
  };
}

/**
 * Expand basket for fan-out "Yes": endpoint + all its non-erasable links.
 * Does not add counterpart endpoints (Data/Geometry off on the other side).
 */
export function expandBasketForFanOut(
  draft: AnnotationDeletionDraft,
  pending: DeletionPendingResolution,
  links: Iterable<AnnotationLink>,
): Pick<AnnotationDeletionDraft, 'candidateLinkIds' | 'candidateGeometryIds' | 'candidateDataIds'> {
  const linkList = [...links];
  const linkById = new Map(linkList.map((link) => [link.id, link]));
  const nextLinks = new Set(draft.candidateLinkIds);
  for (const linkId of pending.incidentLinkIds) {
    if (linkById.has(linkId)) {
      nextLinks.add(linkId);
    }
  }

  const nextGeometry = new Set(draft.candidateGeometryIds);
  const nextData = new Set(draft.candidateDataIds);

  if (pending.endpointKind === 'geometry' && draft.deleteGeometry) {
    nextGeometry.add(pending.endpointId);
  }
  if (pending.endpointKind === 'data' && draft.deleteData) {
    nextData.add(pending.endpointId);
  }

  return {
    candidateLinkIds: [...nextLinks],
    candidateGeometryIds: [...nextGeometry],
    candidateDataIds: [...nextData],
  };
}

/**
 * Whether a counterpart endpoint may enter the basket: every non-erasable link
 * on that counterpart must be among `selectedLinkIds` (typically basket ∪ chosen).
 */
export function counterpartFullyCoveredByLinks(
  endpointKind: 'geometry' | 'data',
  endpointId: string,
  selectedLinkIds: ReadonlySet<string>,
  links: Iterable<AnnotationLink>,
): boolean {
  const incident = endpointKind === 'geometry'
    ? nonErasableLinksForGeometry(links, endpointId)
    : nonErasableLinksForData(links, endpointId);
  if (incident.length === 0) {
    return false;
  }
  return incident.every((link) => selectedLinkIds.has(link.id));
}

/**
 * Expand basket from a set of chosen incident links (All or Let-me-select OK).
 * - Always adds the chosen links.
 * - Adds initiating endpoint only if intent deletes it and all its links are chosen.
 * - Adds counterparts only if intent deletes that side and each is fully covered.
 * - Link-only: never adds endpoints.
 *
 * Note: `links` may be a one-shot iterator (e.g. Map.values()); it is materialized once.
 */
export function expandBasketForSelectedLinks(
  draft: AnnotationDeletionDraft,
  pending: DeletionPendingResolution,
  selectedLinkIds: readonly string[],
  links: Iterable<AnnotationLink>,
): Pick<AnnotationDeletionDraft, 'candidateLinkIds' | 'candidateGeometryIds' | 'candidateDataIds'> {
  const linkList = [...links];
  const linkById = new Map(linkList.map((link) => [link.id, link]));
  const chosen = selectedLinkIds.filter((id) => linkById.has(id));

  const nextLinks = new Set(draft.candidateLinkIds);
  for (const id of chosen) {
    nextLinks.add(id);
  }

  const isLinkOnly = draft.deleteLink && !draft.deleteGeometry && !draft.deleteData;
  if (isLinkOnly) {
    return {
      candidateLinkIds: [...nextLinks],
      candidateGeometryIds: [],
      candidateDataIds: [],
    };
  }

  const nextGeometry = new Set(draft.candidateGeometryIds);
  const nextData = new Set(draft.candidateDataIds);
  // Coverage is against the merged basket, not only this operation's chosen ids
  // (counterparts may already have other links from earlier basket entries).
  const coverageLinks = nextLinks;

  if (
    pending.endpointKind === 'geometry'
    && draft.deleteGeometry
    && counterpartFullyCoveredByLinks('geometry', pending.endpointId, coverageLinks, linkList)
  ) {
    nextGeometry.add(pending.endpointId);
  }
  if (
    pending.endpointKind === 'data'
    && draft.deleteData
    && counterpartFullyCoveredByLinks('data', pending.endpointId, coverageLinks, linkList)
  ) {
    nextData.add(pending.endpointId);
  }

  // Counterparts from chosen links
  for (const linkId of chosen) {
    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }
    if (draft.deleteData && pending.endpointKind === 'geometry') {
      if (counterpartFullyCoveredByLinks('data', link.dataId, coverageLinks, linkList)) {
        nextData.add(link.dataId);
      }
    }
    if (draft.deleteGeometry && pending.endpointKind === 'data') {
      if (counterpartFullyCoveredByLinks('geometry', link.geometryId, coverageLinks, linkList)) {
        nextGeometry.add(link.geometryId);
      }
    }
  }

  return {
    candidateLinkIds: [...nextLinks],
    candidateGeometryIds: [...nextGeometry],
    candidateDataIds: [...nextData],
  };
}

/**
 * Expand basket for a direct 1:1 endpoint pick (no cardinality modal).
 * Same coverage rules as {@link expandBasketForSelectedLinks}: initiating endpoint
 * is added when fully covered; counterpart only when fully covered by the merged basket.
 */
export function expandBasketForEndpointOneToOne(
  draft: AnnotationDeletionDraft,
  endpointKind: 'geometry' | 'data',
  endpointId: string,
  link: AnnotationLink,
  links: Iterable<AnnotationLink>,
): Pick<AnnotationDeletionDraft, 'candidateLinkIds' | 'candidateGeometryIds' | 'candidateDataIds'> {
  const linkList = [...links];
  const nextLinks = new Set(draft.candidateLinkIds);
  nextLinks.add(link.id);
  const coverageLinks = nextLinks;

  const nextGeometry = new Set(draft.candidateGeometryIds);
  const nextData = new Set(draft.candidateDataIds);

  if (
    endpointKind === 'geometry'
    && draft.deleteGeometry
    && counterpartFullyCoveredByLinks('geometry', endpointId, coverageLinks, linkList)
  ) {
    nextGeometry.add(endpointId);
  }
  if (
    endpointKind === 'data'
    && draft.deleteData
    && counterpartFullyCoveredByLinks('data', endpointId, coverageLinks, linkList)
  ) {
    nextData.add(endpointId);
  }

  if (draft.deleteData && endpointKind === 'geometry') {
    if (counterpartFullyCoveredByLinks('data', link.dataId, coverageLinks, linkList)) {
      nextData.add(link.dataId);
    }
  }
  if (draft.deleteGeometry && endpointKind === 'data') {
    if (counterpartFullyCoveredByLinks('geometry', link.geometryId, coverageLinks, linkList)) {
      nextGeometry.add(link.geometryId);
    }
  }

  return {
    candidateLinkIds: [...nextLinks],
    candidateGeometryIds: [...nextGeometry],
    candidateDataIds: [...nextData],
  };
}

/** Map selected counterpart ids → incident link ids between endpoint and counterparts. */
export function linkIdsForCounterparts(
  pending: DeletionPendingResolution,
  counterpartIds: readonly string[],
  links: Iterable<AnnotationLink>,
): string[] {
  const linkList = [...links];
  const counterparts = new Set(counterpartIds);
  const out: string[] = [];
  for (const link of linkList) {
    if (link.erasableAt !== null) {
      continue;
    }
    if (!pending.incidentLinkIds.includes(link.id)) {
      continue;
    }
    if (pending.endpointKind === 'geometry') {
      if (link.geometryId === pending.endpointId && counterparts.has(link.dataId)) {
        out.push(link.id);
      }
    } else if (link.dataId === pending.endpointId && counterparts.has(link.geometryId)) {
      out.push(link.id);
    }
  }
  return out;
}

export function incidentLinksForEndpoint(
  endpointKind: 'geometry' | 'data',
  endpointId: string,
  links: Iterable<AnnotationLink>,
): AnnotationLink[] {
  return endpointKind === 'geometry'
    ? nonErasableLinksForGeometry(links, endpointId)
    : nonErasableLinksForData(links, endpointId);
}

export function needsCardinalityResolution(
  intent: AnnotationDeletionIntent,
  incident: readonly AnnotationLink[],
): DeletionCardinalityKind {
  if (!isOneToManyLinks(incident)) {
    return null;
  }
  return resolveDeletionCardinalityModal(intent);
}
