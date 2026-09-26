import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';

export interface DeletionHighlightIds {
  geometryIds: string[];
  dataIds: string[];
}

type DeletionHighlightDraft = Pick<
  AnnotationDeletionDraft,
  'candidateGeometryIds' | 'candidateDataIds' | 'candidateLinkIds'
> & {
  pendingResolution?: AnnotationDeletionDraft['pendingResolution'];
  targetKind?: AnnotationDeletionDraft['targetKind'];
  targetId?: AnnotationDeletionDraft['targetId'];
  operation?: AnnotationDeletionDraft['operation'];
  selectedEndpointIds?: string[];
};

/**
 * Ids to highlight during deletion selection.
 * Basket endpoints plus both ends of every basket link (so Link-only is visible).
 * During data-led Let-me-select, geometry highlights are ONLY the in-progress
 * counterpart picks — basket geometries must not be forced into the filtered
 * viewer or ctrl multi-select fights the sync effect.
 */
export function resolveDeletionHighlightIds(
  draft: DeletionHighlightDraft,
  links: Iterable<AnnotationLink>,
): DeletionHighlightIds {
  if (draft.operation) {
    return {
      geometryIds: draft.targetKind === 'geometry' ? [...(draft.selectedEndpointIds ?? [])] : [],
      dataIds: draft.targetKind === 'data' ? [...(draft.selectedEndpointIds ?? [])] : [],
    };
  }
  const pending = draft.pendingResolution;
  if (pending?.modal === 'pickCounterparts' && pending.endpointKind === 'data') {
    return {
      geometryIds: [...pending.selectedCounterpartIds],
      dataIds: [pending.endpointId],
    };
  }

  const geometryIds = new Set(draft.candidateGeometryIds);
  const dataIds = new Set(draft.candidateDataIds);
  if (draft.targetKind === 'geometry' && draft.targetId) geometryIds.add(draft.targetId);
  if (draft.targetKind === 'data' && draft.targetId) dataIds.add(draft.targetId);
  const linkById = new Map([...links].map((link) => [link.id, link]));

  for (const linkId of draft.candidateLinkIds) {
    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }
    geometryIds.add(link.geometryId);
    dataIds.add(link.dataId);
  }

  if (pending?.modal === 'pickCounterparts' && pending.endpointKind === 'geometry') {
    geometryIds.add(pending.endpointId);
    for (const dataId of pending.selectedCounterpartIds) {
      dataIds.add(dataId);
    }
  }

  return {
    geometryIds: [...geometryIds],
    dataIds: [...dataIds],
  };
}

export function isGeometryHighlightedForDeletion(
  geometryId: string,
  draft: DeletionHighlightDraft,
  links: Iterable<AnnotationLink>,
): boolean {
  return resolveDeletionHighlightIds(draft, links).geometryIds.includes(geometryId);
}

export function isDataHighlightedForDeletion(
  dataId: string,
  draft: DeletionHighlightDraft,
  links: Iterable<AnnotationLink>,
): boolean {
  return resolveDeletionHighlightIds(draft, links).dataIds.includes(dataId);
}
