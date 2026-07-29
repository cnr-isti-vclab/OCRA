import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';

/** How an annotation entity is drawn in viewer/panel (Plain = normal, Ghost = retained weak, None = hidden). */
export type AnnotationRenderingMode = 'plain' | 'ghost' | 'none';

export interface ErasableEntityRef {
  erasableAt: string | null;
}

/**
 * Resolves Plain / Ghost / None from the entity's own erasable flag and its incident links only.
 * Counterpart endpoint state is intentionally ignored.
 */
export function resolveRenderingMode(
  entity: ErasableEntityRef,
  incidentLinks: Iterable<ErasableEntityRef>,
): AnnotationRenderingMode {
  if (entity.erasableAt === null) {
    return 'plain';
  }
  for (const link of incidentLinks) {
    if (link.erasableAt === null) {
      return 'ghost';
    }
  }
  return 'none';
}

export function resolveGeometryRenderingMode(
  geometry: ErasableEntityRef,
  incidentLinks: Iterable<AnnotationLink>,
): AnnotationRenderingMode {
  return resolveRenderingMode(geometry, incidentLinks);
}

export function resolveDataRenderingMode(
  datum: ErasableEntityRef,
  incidentLinks: Iterable<AnnotationLink>,
): AnnotationRenderingMode {
  return resolveRenderingMode(datum, incidentLinks);
}

/** Whether a rendering mode is visible for the current show-ghost toggle. None is never shown. */
export function isRenderingModeVisible(
  mode: AnnotationRenderingMode,
  showGhost: boolean,
): boolean {
  if (mode === 'none') {
    return false;
  }
  if (mode === 'ghost') {
    return showGhost;
  }
  return true;
}

export function passesRenderingVisibility(
  entity: ErasableEntityRef,
  incidentLinks: Iterable<AnnotationLink>,
  showGhost: boolean,
): boolean {
  return isRenderingModeVisible(resolveRenderingMode(entity, incidentLinks), showGhost);
}

/** Strong (non-erasable) links incident on an entity — used for relationship indexes and labels. */
export function strongIncidentLinks(links: Iterable<AnnotationLink>): AnnotationLink[] {
  return [...links].filter((link) => link.erasableAt === null);
}

export function hasStrongIncidentLinks(links: Iterable<AnnotationLink>): boolean {
  for (const link of links) {
    if (link.erasableAt === null) {
      return true;
    }
  }
  return false;
}

export function resolveShowGhost(criteria: { showGhost?: boolean; includeErasable?: boolean }): boolean {
  return criteria.showGhost ?? criteria.includeErasable ?? false;
}

export function buildRenderingModeMaps(
  geometryIds: ReadonlySet<string>,
  dataIds: ReadonlySet<string>,
  maps: {
    geometries: ReadonlyMap<string, AnnotationGeometry>;
    data: ReadonlyMap<string, AnnotationData>;
    linksByGeometryId: ReadonlyMap<string, AnnotationLink[]>;
    linksByDataId: ReadonlyMap<string, AnnotationLink[]>;
  },
): {
  renderingModeByGeometryId: ReadonlyMap<string, AnnotationRenderingMode>;
  renderingModeByDataId: ReadonlyMap<string, AnnotationRenderingMode>;
} {
  const renderingModeByGeometryId = new Map<string, AnnotationRenderingMode>();
  for (const geometryId of geometryIds) {
    const geometry = maps.geometries.get(geometryId);
    if (!geometry) {
      continue;
    }
    const incidentLinks = maps.linksByGeometryId.get(geometryId) ?? [];
    renderingModeByGeometryId.set(geometryId, resolveGeometryRenderingMode(geometry, incidentLinks));
  }

  const renderingModeByDataId = new Map<string, AnnotationRenderingMode>();
  for (const dataId of dataIds) {
    const datum = maps.data.get(dataId);
    if (!datum) {
      continue;
    }
    const incidentLinks = maps.linksByDataId.get(dataId) ?? [];
    renderingModeByDataId.set(dataId, resolveDataRenderingMode(datum, incidentLinks));
  }

  return { renderingModeByGeometryId, renderingModeByDataId };
}
