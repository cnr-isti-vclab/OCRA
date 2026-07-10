import { useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { filterDataByClassFilter } from '../../stores/annotation-class-filter';
import {
  applyAnnotationLinkViewMode,
  type AnnotationLinkViewMode,
} from './annotationLinkViewMode';

export function useAnnotationLinkView() {
  const {
    activeGeometries,
    activeData,
    activeAnnotationSelection,
    focusedGeometryIds,
    focusedDataIds,
    linkViewMode,
    setLinkViewMode,
    annotationClassFilterValues,
  } = useAnnotationStore();

  const linkViewResult = useMemo(
    () =>
      applyAnnotationLinkViewMode({
        mode: linkViewMode,
        activeGeometries,
        activeData,
        selection: activeAnnotationSelection,
        focusedGeometryIds,
        focusedDataIds,
      }),
    [
      linkViewMode,
      activeGeometries,
      activeData,
      activeAnnotationSelection,
      focusedGeometryIds,
      focusedDataIds,
    ],
  );

  const classFilteredVisibleData = useMemo(
    () => filterDataByClassFilter(linkViewResult.visibleData, annotationClassFilterValues),
    [linkViewResult.visibleData, annotationClassFilterValues],
  );

  return {
    linkViewMode,
    setLinkViewMode,
    visibleGeometries: linkViewResult.visibleGeometries,
    visibleData: classFilteredVisibleData,
    panelShowsFilteredData:
      linkViewMode === 'selectGeometry' && focusedGeometryIds.size > 0,
    viewerShowsFilteredGeometries:
      linkViewMode === 'selectData' && focusedDataIds.size > 0,
  };
}

export type { AnnotationLinkViewMode };
