import type { AnnotationLink } from 'shared/annotation-types';

/** Active counterparts shared by every selected endpoint. */
export function commonAnnotationCounterparts(links: readonly AnnotationLink[], kind: 'geometry' | 'data', endpointIds: readonly string[]): string[] {
  if (endpointIds.length === 0) return [];
  const selected = new Set(endpointIds);
  const sourcesByCounterpart = new Map<string, Set<string>>();
  for (const link of links) {
    const source = kind === 'geometry' ? link.geometryId : link.dataId;
    const counterpart = kind === 'geometry' ? link.dataId : link.geometryId;
    if (link.erasableAt !== null || !selected.has(source)) continue;
    const sources = sourcesByCounterpart.get(counterpart) ?? new Set<string>();
    sources.add(source);
    sourcesByCounterpart.set(counterpart, sources);
  }
  return [...sourcesByCounterpart].filter(([, sources]) => sources.size === selected.size).map(([id]) => id);
}

/** Exact active links affected by unlink (chosen counterparts) or erase (all). */
export function annotationOperationLinks(links: readonly AnnotationLink[], kind: 'geometry' | 'data', endpointIds: readonly string[], counterpartIds?: readonly string[]): AnnotationLink[] {
  const selected = new Set(endpointIds);
  const counterparts = counterpartIds ? new Set(counterpartIds) : null;
  return links.filter((link) => link.erasableAt === null
    && selected.has(kind === 'geometry' ? link.geometryId : link.dataId)
    && (!counterparts || counterparts.has(kind === 'geometry' ? link.dataId : link.geometryId)));
}
