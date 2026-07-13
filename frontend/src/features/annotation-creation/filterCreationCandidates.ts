import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import type { AnnotationCreationDraft } from './types';

export function filterGeometriesForCreationSearch(
  geometries: readonly AnnotationGeometry[],
  draft: Pick<AnnotationCreationDraft, 'geometryScope'>,
): AnnotationGeometry[] {
  return geometries.filter(
    (geometry) =>
      geometry.referenceType === draft.geometryScope.referenceType
      && geometry.referenceId === draft.geometryScope.referenceId,
  );
}

export function filterDataForCreationSearch(
  data: readonly AnnotationData[],
  draft: Pick<AnnotationCreationDraft, 'dataVisibility'>,
): AnnotationData[] {
  return data.filter(
    (datum) =>
      datum.visibilityType === draft.dataVisibility.visibilityType
      && datum.visibilityId === draft.dataVisibility.visibilityId,
  );
}
