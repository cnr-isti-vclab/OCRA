import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import type { AnnotationCreationDraft } from './types';

export interface CreationSearchFilterOptions {
  /** When false (default), soft-deleted (erasable) entities are excluded. */
  includeErasable?: boolean;
}

export function filterGeometriesForCreationSearch(
  geometries: readonly AnnotationGeometry[],
  draft: Pick<AnnotationCreationDraft, 'geometryScope'>,
  options: CreationSearchFilterOptions = {},
): AnnotationGeometry[] {
  const includeErasable = options.includeErasable ?? false;
  return geometries.filter(
    (geometry) =>
      (includeErasable || geometry.erasableAt === null)
      && geometry.referenceType === draft.geometryScope.referenceType
      && geometry.referenceId === draft.geometryScope.referenceId,
  );
}

export function filterDataForCreationSearch(
  data: readonly AnnotationData[],
  draft: Pick<AnnotationCreationDraft, 'dataVisibility'>,
  options: CreationSearchFilterOptions = {},
): AnnotationData[] {
  const includeErasable = options.includeErasable ?? false;
  return data.filter(
    (datum) =>
      (includeErasable || datum.erasableAt === null)
      && datum.visibilityType === draft.dataVisibility.visibilityType
      && datum.visibilityId === draft.dataVisibility.visibilityId,
  );
}
