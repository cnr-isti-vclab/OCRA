import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';

export interface DeletionHighlightIds {
  geometryIds: string[];
  dataIds: string[];
}

/**
 * Ids to highlight during deletion selection.
 * Basket endpoints plus both ends of every basket link (so Link-only is visible).
 */
export function resolveDeletionHighlightIds(
  draft: Pick<
    AnnotationDeletionDraft,
    'candidateGeometryIds' | 'candidateDataIds' | 'candidateLinkIds'
  >,
  links: Iterable<AnnotationLink>,
): DeletionHighlightIds {
  const geometryIds = new Set(draft.candidateGeometryIds);
  const dataIds = new Set(draft.candidateDataIds);
  const linkById = new Map([...links].map((link) => [link.id, link]));

  for (const linkId of draft.candidateLinkIds) {
    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }
    geometryIds.add(link.geometryId);
    dataIds.add(link.dataId);
  }

  return {
    geometryIds: [...geometryIds],
    dataIds: [...dataIds],
  };
}

export function isGeometryHighlightedForDeletion(
  geometryId: string,
  draft: Pick<
    AnnotationDeletionDraft,
    'candidateGeometryIds' | 'candidateDataIds' | 'candidateLinkIds'
  >,
  links: Iterable<AnnotationLink>,
): boolean {
  return resolveDeletionHighlightIds(draft, links).geometryIds.includes(geometryId);
}

export function isDataHighlightedForDeletion(
  dataId: string,
  draft: Pick<
    AnnotationDeletionDraft,
    'candidateGeometryIds' | 'candidateDataIds' | 'candidateLinkIds'
  >,
  links: Iterable<AnnotationLink>,
): boolean {
  return resolveDeletionHighlightIds(draft, links).dataIds.includes(dataId);
}
