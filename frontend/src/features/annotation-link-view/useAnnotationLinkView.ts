import { useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { filterDataByClassFilter } from '../../stores/annotation-class-filter';
import { resolveDeletionLinkViewFocus } from '../annotation-deletion/annotationDeletionCardinality';
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

  const deletionFocus = useMemo(() => {
    if (!isDeletionWizardActive || !deletionDraft) {
      return null;
    }
    return resolveDeletionLinkViewFocus(deletionDraft);
  }, [deletionDraft, isDeletionWizardActive]);

  const effectiveFocusedGeometryIds = deletionFocus?.focusedGeometryIds ?? focusedGeometryIds;
  const effectiveFocusedDataIds = deletionFocus?.focusedDataIds ?? focusedDataIds;

  const linkViewResult = useMemo(
    () => {
      // Creation still shows the full active sets (wizard has its own visibility rules).
      if (isCreationWizardActive) {
        return {
          visibleGeometries: [...activeGeometries],
          visibleData: [...activeData],
        };
      }

      const result = applyAnnotationLinkViewMode({
        mode: linkViewMode,
        activeGeometries,
        activeData,
        selection: activeAnnotationSelection,
        focusedGeometryIds: effectiveFocusedGeometryIds,
        focusedDataIds: effectiveFocusedDataIds,
      });

      // Keep basket endpoints visible even if filtering would hide them.
      if (isDeletionWizardActive && deletionDraft) {
        const pending = deletionDraft.pendingResolution;
        // Data-led Let-me-select: show only geometries linked to the pending data.
        if (
          pending?.modal === 'pickCounterparts'
          && pending.endpointKind === 'data'
        ) {
          const allowed = new Set(
            activeAnnotationSelection.geometryIdsByDataId.get(pending.endpointId) ?? [],
          );
          const pickGeometries = activeGeometries.filter((geometry) => {
            if (allowed.size > 0) {
              return allowed.has(geometry.id);
            }
            return (activeAnnotationSelection.dataIdsByGeometryId.get(geometry.id) ?? [])
              .includes(pending.endpointId);
          });
          return {
            visibleGeometries: pickGeometries,
            visibleData: activeData.filter((datum) => datum.id === pending.endpointId),
          };
        }

        const geometryIds = new Set(deletionDraft.candidateGeometryIds);
        const dataIds = new Set(deletionDraft.candidateDataIds);
        const geometries = [...result.visibleGeometries];
        const data = [...result.visibleData];
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
        return { visibleGeometries: geometries, visibleData: data };
      }

      return result;
    },
    [
      isCreationWizardActive,
      isDeletionWizardActive,
      deletionDraft,
      linkViewMode,
      activeGeometries,
      activeData,
      activeAnnotationSelection,
      effectiveFocusedGeometryIds,
      effectiveFocusedDataIds,
    ],
  );

  const classFilteredVisibleData = useMemo(
    () => {
      // Data-led Let-me-select already narrowed to the pending row — don't hide it via class filter.
      const pending = deletionDraft?.pendingResolution;
      if (
        isDeletionWizardActive
        && pending?.modal === 'pickCounterparts'
        && pending.endpointKind === 'data'
      ) {
        return linkViewResult.visibleData;
      }
      return filterDataByClassFilter(linkViewResult.visibleData, annotationClassFilterValues);
    },
    [
      annotationClassFilterValues,
      deletionDraft?.pendingResolution,
      isDeletionWizardActive,
      linkViewResult.visibleData,
    ],
  );

  return {
    linkViewMode,
    setLinkViewMode,
    visibleGeometries: linkViewResult.visibleGeometries,
    visibleData: classFilteredVisibleData,
    panelShowsFilteredData:
      linkViewMode === 'selectGeometry'
      && (effectiveFocusedGeometryIds.size > 0 || effectiveFocusedDataIds.size > 0),
    viewerShowsFilteredGeometries:
      linkViewMode === 'selectData'
      && (effectiveFocusedDataIds.size > 0 || effectiveFocusedGeometryIds.size > 0),
  };
}

export type { AnnotationLinkViewMode };
