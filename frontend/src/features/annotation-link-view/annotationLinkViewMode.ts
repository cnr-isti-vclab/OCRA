import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import type { ActiveAnnotationSelection } from '../../stores/annotation-selection';
import { dataIdsForFocusedGeometries, geometryIdsForFocusedData } from '../../adapters/annotation-store/geometryToViewerAnnotation';

/**
 * How linked geometry/data triplets are surfaced in the panel and viewer.
 *
 * @see doc/annotation-creation.md — Annotation connection (link) visualization
 */
export type AnnotationLinkViewMode = 'showAll' | 'selectGeometry' | 'selectData';

export const ANNOTATION_LINK_VIEW_MODES: readonly AnnotationLinkViewMode[] = [
  'showAll',
  'selectGeometry',
  'selectData',
] as const;

export interface AnnotationLinkViewLabels {
  showAll: string;
  selectGeometry: string;
  selectData: string;
}

export const DEFAULT_ANNOTATION_LINK_VIEW_LABELS: AnnotationLinkViewLabels = {
  showAll: 'Show all',
  selectGeometry: 'By geometry',
  selectData: 'By data',
};

export interface ApplyAnnotationLinkViewInput {
  mode: AnnotationLinkViewMode;
  activeGeometries: readonly AnnotationGeometry[];
  activeData: readonly AnnotationData[];
  selection: ActiveAnnotationSelection;
  focusedGeometryIds: ReadonlySet<string>;
  focusedDataIds: ReadonlySet<string>;
}

export interface AnnotationLinkViewResult {
  visibleGeometries: AnnotationGeometry[];
  visibleData: AnnotationData[];
}

function filterByIds<T extends { id: string }>(items: readonly T[], allowedIds: ReadonlySet<string>): T[] {
  if (allowedIds.size === 0) {
    return [...items];
  }
  return items.filter((item) => allowedIds.has(item.id));
}

/**
 * Geometry ids that drive panel filtering in {@link selectGeometry} mode.
 * Direct geometry focus wins; otherwise derive from focused data (e.g. after switching from by-data).
 */
function resolveGeometryAnchorsForPanel(
  focusedGeometryIds: ReadonlySet<string>,
  focusedDataIds: ReadonlySet<string>,
  selection: ActiveAnnotationSelection,
): Set<string> {
  if (focusedGeometryIds.size > 0) {
    return new Set(focusedGeometryIds);
  }
  return new Set(geometryIdsForFocusedData(focusedDataIds, selection));
}

/**
 * Geometry ids that drive viewer filtering in {@link selectData} mode.
 * Data-led focus wins; otherwise use direct geometry focus (e.g. after switching from by-geometry).
 */
function resolveGeometryAnchorsForViewer(
  focusedGeometryIds: ReadonlySet<string>,
  focusedDataIds: ReadonlySet<string>,
  selection: ActiveAnnotationSelection,
): Set<string> {
  if (focusedDataIds.size > 0) {
    return new Set(geometryIdsForFocusedData(focusedDataIds, selection));
  }
  return new Set(focusedGeometryIds);
}

/**
 * Applies link-view mode on top of the query-filtered active sets.
 * Focus on the driving side narrows the opposite side; with no focus, both sides stay unfiltered.
 * When switching modes, focus on the non-driving side is used as a fallback anchor so behaviour stays symmetric.
 */
export function applyAnnotationLinkViewMode({
  mode,
  activeGeometries,
  activeData,
  selection,
  focusedGeometryIds,
  focusedDataIds,
}: ApplyAnnotationLinkViewInput): AnnotationLinkViewResult {
  if (mode === 'showAll') {
    return {
      visibleGeometries: [...activeGeometries],
      visibleData: [...activeData],
    };
  }

  if (mode === 'selectGeometry') {
    const anchorGeometryIds = resolveGeometryAnchorsForPanel(
      focusedGeometryIds,
      focusedDataIds,
      selection,
    );
    if (anchorGeometryIds.size === 0) {
      return {
        visibleGeometries: [...activeGeometries],
        visibleData: [...activeData],
      };
    }

    const linkedDataIds = new Set(
      dataIdsForFocusedGeometries(anchorGeometryIds, selection),
    );
    return {
      visibleGeometries: [...activeGeometries],
      visibleData: filterByIds(activeData, linkedDataIds),
    };
  }

  const anchorGeometryIds = resolveGeometryAnchorsForViewer(
    focusedGeometryIds,
    focusedDataIds,
    selection,
  );
  if (anchorGeometryIds.size === 0) {
    return {
      visibleGeometries: [...activeGeometries],
      visibleData: [...activeData],
    };
  }

  return {
    visibleGeometries: filterByIds(activeGeometries, anchorGeometryIds),
    visibleData: [...activeData],
  };
}
