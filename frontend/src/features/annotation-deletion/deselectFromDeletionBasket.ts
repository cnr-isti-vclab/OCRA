import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';

export type DeletionBasketIds = Pick<
  AnnotationDeletionDraft,
  'candidateLinkIds' | 'candidateGeometryIds' | 'candidateDataIds'
>;

function linkByIdMap(links: Iterable<AnnotationLink>): Map<string, AnnotationLink> {
  return new Map([...links].map((link) => [link.id, link]));
}

function basketLinksForGeometry(
  draft: DeletionBasketIds,
  linkById: Map<string, AnnotationLink>,
  geometryId: string,
): AnnotationLink[] {
  const out: AnnotationLink[] = [];
  for (const linkId of draft.candidateLinkIds) {
    const link = linkById.get(linkId);
    if (link && link.geometryId === geometryId) {
      out.push(link);
    }
  }
  return out;
}

function basketLinksForData(
  draft: DeletionBasketIds,
  linkById: Map<string, AnnotationLink>,
  dataId: string,
): AnnotationLink[] {
  const out: AnnotationLink[] = [];
  for (const linkId of draft.candidateLinkIds) {
    const link = linkById.get(linkId);
    if (link && link.dataId === dataId) {
      out.push(link);
    }
  }
  return out;
}

function counterpartHasOtherBasketLink(
  candidateLinkIds: ReadonlySet<string>,
  linkById: Map<string, AnnotationLink>,
  args: {
    exceptLinkId: string;
    geometryId?: string;
    dataId?: string;
  },
): boolean {
  for (const linkId of candidateLinkIds) {
    if (linkId === args.exceptLinkId) {
      continue;
    }
    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }
    if (args.geometryId !== undefined && link.geometryId === args.geometryId) {
      return true;
    }
    if (args.dataId !== undefined && link.dataId === args.dataId) {
      return true;
    }
  }
  return false;
}

function isLinkOnly(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): boolean {
  return draft.deleteLink && !draft.deleteGeometry && !draft.deleteData;
}

/**
 * Cascade-remove a geometry (or a geometry highlight from a basket link) from the delete basket.
 */
export function deselectGeometryFromDeletionBasket(
  draft: AnnotationDeletionDraft,
  geometryId: string,
  links: Iterable<AnnotationLink>,
): DeletionBasketIds {
  const linkById = linkByIdMap(links);
  const incident = basketLinksForGeometry(draft, linkById, geometryId);

  if (isLinkOnly(draft)) {
    const remove = new Set(incident.map((link) => link.id));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !remove.has(id)),
      candidateGeometryIds: [],
      candidateDataIds: [],
    };
  }

  if (draft.deleteGeometry && !draft.deleteData) {
    const remove = new Set(incident.map((link) => link.id));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !remove.has(id)),
      candidateGeometryIds: draft.candidateGeometryIds.filter((id) => id !== geometryId),
      candidateDataIds: draft.candidateDataIds,
    };
  }

  if (draft.deleteData && !draft.deleteGeometry) {
    // Geometry is only highlighted via basket links — drop those links and their data.
    const removeLinks = new Set(incident.map((link) => link.id));
    const removeData = new Set(incident.map((link) => link.dataId));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !removeLinks.has(id)),
      candidateGeometryIds: draft.candidateGeometryIds,
      candidateDataIds: draft.candidateDataIds.filter((id) => !removeData.has(id)),
    };
  }

  // Link + Geometry + Data
  const nextLinkIds = new Set(draft.candidateLinkIds);
  const nextGeometryIds = new Set(draft.candidateGeometryIds);
  const nextDataIds = new Set(draft.candidateDataIds);

  nextGeometryIds.delete(geometryId);

  for (const link of incident) {
    const otherHasAnother = counterpartHasOtherBasketLink(nextLinkIds, linkById, {
      exceptLinkId: link.id,
      dataId: link.dataId,
    });
    nextLinkIds.delete(link.id);
    if (!otherHasAnother) {
      nextDataIds.delete(link.dataId);
    }
  }

  return {
    candidateLinkIds: [...nextLinkIds],
    candidateGeometryIds: [...nextGeometryIds],
    candidateDataIds: [...nextDataIds],
  };
}

/**
 * Cascade-remove a data record (or a data highlight from a basket link) from the delete basket.
 */
export function deselectDataFromDeletionBasket(
  draft: AnnotationDeletionDraft,
  dataId: string,
  links: Iterable<AnnotationLink>,
): DeletionBasketIds {
  const linkById = linkByIdMap(links);
  const incident = basketLinksForData(draft, linkById, dataId);

  if (isLinkOnly(draft)) {
    const remove = new Set(incident.map((link) => link.id));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !remove.has(id)),
      candidateGeometryIds: [],
      candidateDataIds: [],
    };
  }

  if (draft.deleteData && !draft.deleteGeometry) {
    const remove = new Set(incident.map((link) => link.id));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !remove.has(id)),
      candidateDataIds: draft.candidateDataIds.filter((id) => id !== dataId),
      candidateGeometryIds: draft.candidateGeometryIds,
    };
  }

  if (draft.deleteGeometry && !draft.deleteData) {
    // Data is only highlighted via basket links — drop those links and their geometries.
    const removeLinks = new Set(incident.map((link) => link.id));
    const removeGeometry = new Set(incident.map((link) => link.geometryId));
    return {
      candidateLinkIds: draft.candidateLinkIds.filter((id) => !removeLinks.has(id)),
      candidateDataIds: draft.candidateDataIds,
      candidateGeometryIds: draft.candidateGeometryIds.filter((id) => !removeGeometry.has(id)),
    };
  }

  // Link + Geometry + Data
  const nextLinkIds = new Set(draft.candidateLinkIds);
  const nextGeometryIds = new Set(draft.candidateGeometryIds);
  const nextDataIds = new Set(draft.candidateDataIds);

  nextDataIds.delete(dataId);

  for (const link of incident) {
    const otherHasAnother = counterpartHasOtherBasketLink(nextLinkIds, linkById, {
      exceptLinkId: link.id,
      geometryId: link.geometryId,
    });
    nextLinkIds.delete(link.id);
    if (!otherHasAnother) {
      nextGeometryIds.delete(link.geometryId);
    }
  }

  return {
    candidateLinkIds: [...nextLinkIds],
    candidateGeometryIds: [...nextGeometryIds],
    candidateDataIds: [...nextDataIds],
  };
}
