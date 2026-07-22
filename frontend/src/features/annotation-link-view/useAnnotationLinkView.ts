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
    isCreationWizardActive,
    isDeletionWizardActive,
    deletionDraft,
  } = useAnnotationStore();

  const linkViewResult = useMemo(
    () => {
      if (isCreationWizardActive || isDeletionWizardActive) {
        const geometries = [...activeGeometries];
        const data = [...activeData];

        // Keep basket endpoints visible even if focus/filter would hide them.
        if (isDeletionWizardActive && deletionDraft) {
          const geometryIds = new Set(deletionDraft.candidateGeometryIds);
          const dataIds = new Set(deletionDraft.candidateDataIds);
          for (const geometry of activeGeometries) {
            if (geometryIds.has(geometry.id) && !geometries.some((g) => g.id === geometry.id)) {
              geometries.push(geometry);
            }
          }
          for (const datum of activeData) {
            if (dataIds.has(datum.id) && !data.some((d) => d.id === datum.id)) {
              data.push(datum);
            }
          }
        }

        return {
          visibleGeometries: geometries,
          visibleData: data,
        };
      }

      return applyAnnotationLinkViewMode({
        mode: linkViewMode,
        activeGeometries,
        activeData,
        selection: activeAnnotationSelection,
        focusedGeometryIds,
        focusedDataIds,
      });
    },
    [
      isCreationWizardActive,
      isDeletionWizardActive,
      deletionDraft,
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
      linkViewMode === 'selectGeometry'
      && (focusedGeometryIds.size > 0 || focusedDataIds.size > 0),
    viewerShowsFilteredGeometries:
      linkViewMode === 'selectData'
      && (focusedDataIds.size > 0 || focusedGeometryIds.size > 0),
  };
}

export type { AnnotationLinkViewMode };
