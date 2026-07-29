import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';

/**
 * How an annotation entity is drawn in viewer/panel.
 * - plain: normal active entity
 * - ghost: weak endpoint retained by a strong incident link
 * - none: weak orphan (no strong incident link) — shown only when erased are visible
 */
export type AnnotationRenderingMode = 'plain' | 'ghost' | 'none';

/** OpenLIME structural class used for recoverable weak geometries. */
export type AnnotationStructuralClass = 'ghost' | 'orphan';

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

/** Maps rendering mode to OpenLIME structural class (plain has none). */
export function structuralClassForRenderingMode(
  mode: AnnotationRenderingMode | undefined,
): AnnotationStructuralClass | null {
  if (mode === 'ghost') {
    return 'ghost';
  }
  if (mode === 'none') {
    return 'orphan';
  }
  return null;
}

/** Ghost and orphan are selectable only for restore / unerase. */
export function isRecoverableRenderingMode(
  mode: AnnotationRenderingMode | undefined,
): boolean {
  return mode === 'ghost' || mode === 'none';
}

/**
 * Whether a rendering mode is visible for the show-erased toggle.
 * Toggle off: plain only. Toggle on: plain + ghost + orphan (none).
 */
export function isRenderingModeVisible(
  mode: AnnotationRenderingMode,
  showErased: boolean,
): boolean {
  if (mode === 'plain') {
    return true;
  }
  return showErased;
}

export function passesRenderingVisibility(
  entity: ErasableEntityRef,
  incidentLinks: Iterable<AnnotationLink>,
  showErased: boolean,
): boolean {
  return isRenderingModeVisible(resolveRenderingMode(entity, incidentLinks), showErased);
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

/**
 * Resolves the show-erased toggle from selection criteria.
 * Prefer `showErased`; `showGhost` / `includeErasable` remain as aliases.
 */
export function resolveShowErased(criteria: {
  showErased?: boolean;
  showGhost?: boolean;
  includeErasable?: boolean;
}): boolean {
  return criteria.showErased ?? criteria.showGhost ?? criteria.includeErasable ?? false;
}

/** @deprecated Use {@link resolveShowErased}. */
export function resolveShowGhost(criteria: {
  showErased?: boolean;
  showGhost?: boolean;
  includeErasable?: boolean;
}): boolean {
  return resolveShowErased(criteria);
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
