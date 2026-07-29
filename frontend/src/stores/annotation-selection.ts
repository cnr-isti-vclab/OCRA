import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  AnnotationScopeType,
  ResolvedAnnotation,
} from 'shared/annotation-types';
import {
  buildRenderingModeMaps,
  hasStrongIncidentLinks,
  passesRenderingVisibility,
  resolveShowGhost,
  type AnnotationRenderingMode,
} from './annotation-rendering';

export interface AnnotationStoreMaps {
  geometries: Map<string, AnnotationGeometry>;
  data: Map<string, AnnotationData>;
  links: Map<string, AnnotationLink>;
}

export type LinkPresence = 'any' | 'linked' | 'unlinked';

export type SelectionLinkMode = 'independent' | 'anyEndpoint' | 'bothEndpoints';

export interface GeometryPredicate {
  ids?: string[];
  referenceType?: AnnotationScopeType;
  referenceId?: string;
  erasable?: boolean;
  linkPresence?: LinkPresence;
  custom?: (geometry: AnnotationGeometry, ctx: SelectionEvaluationContext) => boolean;
}

export interface DataPredicate {
  ids?: string[];
  labelContains?: string;
  classEquals?: string | null;
  visibilityType?: AnnotationScopeType;
  visibilityId?: string;
  erasable?: boolean;
  linkPresence?: LinkPresence;
  custom?: (datum: AnnotationData, ctx: SelectionEvaluationContext) => boolean;
}

export interface LinkPredicate {
  ids?: string[];
  geometryIds?: string[];
  dataIds?: string[];
  erasable?: boolean;
  custom?: (link: AnnotationLink, ctx: SelectionEvaluationContext) => boolean;
}

/**
 * Declarative filter for which geometries, data, and links are "active" in the UI.
 * Omitted predicates do not filter that entity kind (all loaded entities of that kind qualify,
 * subject to {@link SelectionCriteria.showGhost} rendering visibility).
 */
export interface SelectionCriteria {
  geometry?: GeometryPredicate;
  data?: DataPredicate;
  link?: LinkPredicate;
  /**
   * When true, weak entities retained by a strong incident link (Ghost) are visible.
   * Weak orphans (None) are never shown. Default false.
   */
  showGhost?: boolean;
  /**
   * @deprecated Use {@link SelectionCriteria.showGhost}. When true, equivalent to `showGhost: true`.
   */
  includeErasable?: boolean;
  /**
   * How links are added when {@link LinkPredicate} is omitted.
   * Default `bothEndpoints`.
   */
  linkMode?: SelectionLinkMode;
}

export interface SelectionEvaluationContext {
  readonly sceneId: string;
  readonly linksByGeometryId: ReadonlyMap<string, AnnotationLink[]>;
  readonly linksByDataId: ReadonlyMap<string, AnnotationLink[]>;
}

export interface ActiveAnnotationSelection {
  geometryIds: ReadonlySet<string>;
  dataIds: ReadonlySet<string>;
  linkIds: ReadonlySet<string>;
  geometriesById: ReadonlyMap<string, AnnotationGeometry>;
  dataById: ReadonlyMap<string, AnnotationData>;
  linksById: ReadonlyMap<string, AnnotationLink>;
  linksByGeometryId: ReadonlyMap<string, AnnotationLink[]>;
  linksByDataId: ReadonlyMap<string, AnnotationLink[]>;
  geometryIdsByDataId: ReadonlyMap<string, string[]>;
  dataIdsByGeometryId: ReadonlyMap<string, string[]>;
  renderingModeByGeometryId: ReadonlyMap<string, AnnotationRenderingMode>;
  renderingModeByDataId: ReadonlyMap<string, AnnotationRenderingMode>;
}

export const EMPTY_SELECTION_CRITERIA: SelectionCriteria = {};

export function createEmptyActiveSelection(): ActiveAnnotationSelection {
  return {
    geometryIds: new Set(),
    dataIds: new Set(),
    linkIds: new Set(),
    geometriesById: new Map(),
    dataById: new Map(),
    linksById: new Map(),
    linksByGeometryId: new Map(),
    linksByDataId: new Map(),
    geometryIdsByDataId: new Map(),
    dataIdsByGeometryId: new Map(),
    renderingModeByGeometryId: new Map(),
    renderingModeByDataId: new Map(),
  };
}

function buildLinkIndexes(links: Iterable<AnnotationLink>) {
  const linksByGeometryId = new Map<string, AnnotationLink[]>();
  const linksByDataId = new Map<string, AnnotationLink[]>();

  for (const link of links) {
    const byGeometry = linksByGeometryId.get(link.geometryId);
    if (byGeometry) {
      byGeometry.push(link);
    } else {
      linksByGeometryId.set(link.geometryId, [link]);
    }

    const byData = linksByDataId.get(link.dataId);
    if (byData) {
      byData.push(link);
    } else {
      linksByDataId.set(link.dataId, [link]);
    }
  }

  return { linksByGeometryId, linksByDataId };
}

function matchesLinkPresence(
  presence: LinkPresence | undefined,
  hasLinks: boolean,
): boolean {
  if (!presence || presence === 'any') {
    return true;
  }
  if (presence === 'linked') {
    return hasLinks;
  }
  return !hasLinks;
}

function matchesGeometryPredicate(
  geometry: AnnotationGeometry,
  predicate: GeometryPredicate | undefined,
  ctx: SelectionEvaluationContext,
): boolean {
  if (!predicate) {
    return true;
  }

  if (predicate.erasable === true && geometry.erasableAt === null) {
    return false;
  }
  if (predicate.erasable === false && geometry.erasableAt !== null) {
    return false;
  }

  if (predicate.ids && !predicate.ids.includes(geometry.id)) {
    return false;
  }
  if (predicate.referenceType && geometry.referenceType !== predicate.referenceType) {
    return false;
  }
  if (predicate.referenceId && geometry.referenceId !== predicate.referenceId) {
    return false;
  }

  const incidentLinks = ctx.linksByGeometryId.get(geometry.id) ?? [];
  if (!matchesLinkPresence(predicate.linkPresence, hasStrongIncidentLinks(incidentLinks))) {
    return false;
  }

  if (predicate.custom && !predicate.custom(geometry, ctx)) {
    return false;
  }

  return true;
}

function matchesDataPredicate(
  datum: AnnotationData,
  predicate: DataPredicate | undefined,
  ctx: SelectionEvaluationContext,
): boolean {
  if (!predicate) {
    return true;
  }

  if (predicate.erasable === true && datum.erasableAt === null) {
    return false;
  }
  if (predicate.erasable === false && datum.erasableAt !== null) {
    return false;
  }

  if (predicate.ids && !predicate.ids.includes(datum.id)) {
    return false;
  }
  if (predicate.labelContains) {
    const needle = predicate.labelContains.toLowerCase();
    if (!datum.label.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (predicate.classEquals !== undefined && datum.class !== predicate.classEquals) {
    return false;
  }
  if (predicate.visibilityType && datum.visibilityType !== predicate.visibilityType) {
    return false;
  }
  if (predicate.visibilityId && datum.visibilityId !== predicate.visibilityId) {
    return false;
  }

  const incidentLinks = ctx.linksByDataId.get(datum.id) ?? [];
  if (!matchesLinkPresence(predicate.linkPresence, hasStrongIncidentLinks(incidentLinks))) {
    return false;
  }

  if (predicate.custom && !predicate.custom(datum, ctx)) {
    return false;
  }

  return true;
}

function matchesLinkPredicate(
  link: AnnotationLink,
  predicate: LinkPredicate,
  ctx: SelectionEvaluationContext,
): boolean {
  if (link.erasableAt !== null && predicate.erasable !== true) {
    return false;
  }

  if (predicate.erasable === true && link.erasableAt === null) {
    return false;
  }
  if (predicate.erasable === false && link.erasableAt !== null) {
    return false;
  }

  if (predicate.ids && !predicate.ids.includes(link.id)) {
    return false;
  }
  if (predicate.geometryIds && !predicate.geometryIds.includes(link.geometryId)) {
    return false;
  }
  if (predicate.dataIds && !predicate.dataIds.includes(link.dataId)) {
    return false;
  }

  if (predicate.custom && !predicate.custom(link, ctx)) {
    return false;
  }

  return true;
}

function materializeActiveSelection(
  geometryIds: Set<string>,
  dataIds: Set<string>,
  linkIds: Set<string>,
  maps: AnnotationStoreMaps,
  linkIndexes: ReturnType<typeof buildLinkIndexes>,
): ActiveAnnotationSelection {
  const geometriesById = new Map<string, AnnotationGeometry>();
  for (const id of geometryIds) {
    const geometry = maps.geometries.get(id);
    if (geometry) {
      geometriesById.set(id, geometry);
    }
  }

  const dataById = new Map<string, AnnotationData>();
  for (const id of dataIds) {
    const datum = maps.data.get(id);
    if (datum) {
      dataById.set(id, datum);
    }
  }

  const linksById = new Map<string, AnnotationLink>();
  const activeLinksByGeometryId = new Map<string, AnnotationLink[]>();
  const activeLinksByDataId = new Map<string, AnnotationLink[]>();
  const geometryIdsByDataId = new Map<string, string[]>();
  const dataIdsByGeometryId = new Map<string, string[]>();

  for (const id of linkIds) {
    const link = maps.links.get(id);
    if (!link) {
      continue;
    }

    linksById.set(id, link);

    const geometryList = activeLinksByGeometryId.get(link.geometryId);
    if (geometryList) {
      geometryList.push(link);
    } else {
      activeLinksByGeometryId.set(link.geometryId, [link]);
    }

    const dataList = activeLinksByDataId.get(link.dataId);
    if (dataList) {
      dataList.push(link);
    } else {
      activeLinksByDataId.set(link.dataId, [link]);
    }
  }

  for (const [geometryId, links] of activeLinksByGeometryId) {
    const uniqueDataIds = [...new Set(links.map((link) => link.dataId))];
    dataIdsByGeometryId.set(geometryId, uniqueDataIds);
  }

  for (const [dataId, links] of activeLinksByDataId) {
    const uniqueGeometryIds = [...new Set(links.map((link) => link.geometryId))];
    geometryIdsByDataId.set(dataId, uniqueGeometryIds);
  }

  const { renderingModeByGeometryId, renderingModeByDataId } = buildRenderingModeMaps(
    geometryIds,
    dataIds,
    {
      geometries: geometriesById,
      data: dataById,
      linksByGeometryId: linkIndexes.linksByGeometryId,
      linksByDataId: linkIndexes.linksByDataId,
    },
  );

  return {
    geometryIds,
    dataIds,
    linkIds,
    geometriesById,
    dataById,
    linksById,
    linksByGeometryId: activeLinksByGeometryId,
    linksByDataId: activeLinksByDataId,
    geometryIdsByDataId,
    dataIdsByGeometryId,
    renderingModeByGeometryId,
    renderingModeByDataId,
  };
}

/**
 * Evaluates which geometries, data, and links are active for the current store snapshot.
 */
export function evaluateActiveSelection(
  maps: AnnotationStoreMaps,
  sceneId: string,
  criteria: SelectionCriteria = EMPTY_SELECTION_CRITERIA,
): ActiveAnnotationSelection {
  const showGhost = resolveShowGhost(criteria);
  const linkMode = criteria.linkMode ?? 'bothEndpoints';
  const linkIndexes = buildLinkIndexes(maps.links.values());
  const ctx: SelectionEvaluationContext = {
    sceneId,
    linksByGeometryId: linkIndexes.linksByGeometryId,
    linksByDataId: linkIndexes.linksByDataId,
  };

  const geometryIds = new Set<string>();
  for (const geometry of maps.geometries.values()) {
    const incidentLinks = linkIndexes.linksByGeometryId.get(geometry.id) ?? [];
    if (!passesRenderingVisibility(geometry, incidentLinks, showGhost)) {
      continue;
    }
    if (matchesGeometryPredicate(geometry, criteria.geometry, ctx)) {
      geometryIds.add(geometry.id);
    }
  }

  const dataIds = new Set<string>();
  for (const datum of maps.data.values()) {
    const incidentLinks = linkIndexes.linksByDataId.get(datum.id) ?? [];
    if (!passesRenderingVisibility(datum, incidentLinks, showGhost)) {
      continue;
    }
    if (matchesDataPredicate(datum, criteria.data, ctx)) {
      dataIds.add(datum.id);
    }
  }

  const linkIds = new Set<string>();
  if (criteria.link) {
    for (const link of maps.links.values()) {
      if (matchesLinkPredicate(link, criteria.link, ctx)) {
        linkIds.add(link.id);
      }
    }
  } else if (linkMode !== 'independent') {
    for (const link of maps.links.values()) {
      if (link.erasableAt !== null) {
        continue;
      }

      const geometryActive = geometryIds.has(link.geometryId);
      const dataActive = dataIds.has(link.dataId);

      if (linkMode === 'anyEndpoint' && (geometryActive || dataActive)) {
        linkIds.add(link.id);
      } else if (linkMode === 'bothEndpoints' && geometryActive && dataActive) {
        linkIds.add(link.id);
      }
    }
  }

  return materializeActiveSelection(geometryIds, dataIds, linkIds, maps, linkIndexes);
}

/** Fully linked triples where geometry, data, and link are all active. */
export function getActiveResolvedTriples(
  maps: AnnotationStoreMaps,
  selection: ActiveAnnotationSelection,
): ResolvedAnnotation[] {
  const resolved: ResolvedAnnotation[] = [];

  for (const link of selection.linksById.values()) {
    if (!selection.geometryIds.has(link.geometryId) || !selection.dataIds.has(link.dataId)) {
      continue;
    }

    const geometry = selection.geometriesById.get(link.geometryId) ?? maps.geometries.get(link.geometryId);
    const datum = selection.dataById.get(link.dataId) ?? maps.data.get(link.dataId);
    if (!geometry || !datum) {
      continue;
    }

    resolved.push({ geometry, data: datum, link });
  }

  return resolved;
}

export function getActiveGeometriesForData(
  selection: ActiveAnnotationSelection,
): (dataId: string) => AnnotationGeometry[] {
  return (dataId: string) => {
    const geometryIds = selection.geometryIdsByDataId.get(dataId) ?? [];
    return geometryIds
      .map((id) => selection.geometriesById.get(id))
      .filter((geometry): geometry is AnnotationGeometry => geometry !== undefined);
  };
}

export interface GeometryLabelDisplay {
  labels: string[];
  selected: boolean[];
}

/**
 * Builds parallel label arrays for a geometry (viewer adapter input).
 * `selectedDataIds` is UI focus state — not part of {@link SelectionCriteria}.
 */
export function buildGeometryLabelDisplay(
  geometryId: string,
  selection: ActiveAnnotationSelection,
  selectedDataIds: ReadonlySet<string> = new Set(),
): GeometryLabelDisplay {
  const dataIds = selection.dataIdsByGeometryId.get(geometryId) ?? [];
  const labels: string[] = [];
  const selected: boolean[] = [];

  for (const dataId of dataIds) {
    const datum = selection.dataById.get(dataId);
    labels.push(datum?.label ?? '');
    selected.push(selectedDataIds.has(dataId));
  }

  return { labels, selected };
}
