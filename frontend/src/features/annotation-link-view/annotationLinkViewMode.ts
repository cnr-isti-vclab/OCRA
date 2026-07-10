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
 * Applies link-view mode on top of the query-filtered active sets.
 * Focus on the driving side narrows the opposite side; with no focus, both sides stay unfiltered.
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
    if (focusedGeometryIds.size === 0) {
      return {
        visibleGeometries: [...activeGeometries],
        visibleData: [...activeData],
      };
    }

    const linkedDataIds = new Set(
      dataIdsForFocusedGeometries(focusedGeometryIds, selection),
    );
    return {
      visibleGeometries: [...activeGeometries],
      visibleData: filterByIds(activeData, linkedDataIds),
    };
  }

  if (focusedDataIds.size === 0) {
    return {
      visibleGeometries: [...activeGeometries],
      visibleData: [...activeData],
    };
  }

  const linkedGeometryIds = new Set(
    geometryIdsForFocusedData(focusedDataIds, selection),
  );
  return {
    visibleGeometries: filterByIds(activeGeometries, linkedGeometryIds),
    visibleData: [...activeData],
  };
}
