import { useCallback, useMemo } from 'react';
import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { getViewerHighlightGeometryIds } from '../../adapters/annotation-store/geometryToViewerAnnotation';

export interface AnnotationViewerGeometryEntry {
  geometry: AnnotationGeometry;
  linkedData: AnnotationData[];
}

export interface AnnotationViewerDataEntry {
  data: AnnotationData;
  linkedGeometries: AnnotationGeometry[];
}

/**
 * Read-only controller for the annotation viewer mode.
 * Keeps many-to-many geometry/data navigation outside editor-oriented panels.
 */
export function useAnnotationViewerController() {
  const {
    activeAnnotationSelection,
    activeData,
    activeGeometries,
    focusedDataIds,
    focusedGeometryIds,
    setFocusSelection,
    clearFocus,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
    sceneAnnotationClassPool,
  } = useAnnotationStore();

  const dataById = activeAnnotationSelection.dataById;
  const geometryById = activeAnnotationSelection.geometriesById;

  const filteredActiveData = useMemo(() => {
    if (annotationClassFilterValues.length === 0) {
      return activeData;
    }

    const allowedClasses = new Set(annotationClassFilterValues);
    return activeData.filter((datum) => datum.class !== null && allowedClasses.has(datum.class));
  }, [activeData, annotationClassFilterValues]);

  const visibleGeometryIds = useMemo(
    () =>
      getViewerHighlightGeometryIds(
        focusedGeometryIds,
        focusedDataIds,
        activeAnnotationSelection,
      ),
    [focusedGeometryIds, focusedDataIds, activeAnnotationSelection],
  );

  const visibleGeometries = useMemo(
    () =>
      visibleGeometryIds
        .map((geometryId) => geometryById.get(geometryId))
        .filter((geometry): geometry is AnnotationGeometry => geometry !== undefined),
    [geometryById, visibleGeometryIds],
  );

  const geometryEntries = useMemo<AnnotationViewerGeometryEntry[]>(
    () =>
      visibleGeometries.map((geometry) => ({
        geometry,
        linkedData: (activeAnnotationSelection.dataIdsByGeometryId.get(geometry.id) ?? [])
          .map((dataId) => dataById.get(dataId))
          .filter((datum): datum is AnnotationData => datum !== undefined),
      })),
    [activeAnnotationSelection.dataIdsByGeometryId, dataById, visibleGeometries],
  );

  const dataEntries = useMemo<AnnotationViewerDataEntry[]>(() => {
    const orderedData = new Map<string, AnnotationViewerDataEntry>();

    for (const geometry of visibleGeometries) {
      const dataIds = activeAnnotationSelection.dataIdsByGeometryId.get(geometry.id) ?? [];
      for (const dataId of dataIds) {
        const data = dataById.get(dataId);
        if (!data || orderedData.has(dataId)) {
          continue;
        }

        orderedData.set(dataId, {
          data,
          linkedGeometries: (activeAnnotationSelection.geometryIdsByDataId.get(data.id) ?? [])
            .map((geometryId) => geometryById.get(geometryId))
            .filter((linkedGeometry): linkedGeometry is AnnotationGeometry => linkedGeometry !== undefined),
        });
      }
    }

    return [...orderedData.values()];
  }, [
    activeAnnotationSelection.dataIdsByGeometryId,
    activeAnnotationSelection.geometryIdsByDataId,
    dataById,
    geometryById,
    visibleGeometries,
  ]);

  const selectGeometry = useCallback(
    (geometryId: string, append = false) => {
      const nextGeometryIds = append ? new Set(focusedGeometryIds) : new Set<string>();
      if (append && nextGeometryIds.has(geometryId)) {
        nextGeometryIds.delete(geometryId);
      } else {
        nextGeometryIds.add(geometryId);
      }

      setFocusSelection({
        geometryIds: nextGeometryIds,
        dataIds: [],
      });
    },
    [focusedGeometryIds, setFocusSelection],
  );

  const selectData = useCallback(
    (dataId: string, geometryId?: string, append = false) => {
      const nextDataIds = append ? new Set(focusedDataIds) : new Set<string>();
      if (append && nextDataIds.has(dataId)) {
        nextDataIds.delete(dataId);
      } else {
        nextDataIds.add(dataId);
      }

      setFocusSelection({
        // Keep data-led focus (like editor mode): geometries highlighted as the union
        // of all focused data ids. If a specific geometry was requested, switch to
        // geometry-led focus for that click only.
        geometryIds: geometryId ? [geometryId] : [],
        dataIds: nextDataIds,
      });
    },
    [focusedDataIds, setFocusSelection],
  );

  return {
    activeDataCount: activeData.length,
    activeGeometryCount: activeGeometries.length,
    filteredActiveData,
    geometryEntries,
    dataEntries,
    focusedDataIds,
    focusedGeometryIds,
    sceneAnnotationClassPool,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
    selectGeometry,
    selectData,
    clearFocus,
  };
}
