import type { AnnotationCreationDraft } from './types';
import { emptyPendingData } from './annotationCreationValidation';

export function createDefaultCreationDraft(sceneId: string): AnnotationCreationDraft {
  return {
    step: 'geometry',
    stepOrder: 'geometry-first',
    drawingMode: 'area',
    geometryMode: null,
    dataMode: null,
    geometryScope: {
      referenceType: 'scene',
      referenceId: sceneId,
    },
    dataVisibility: {
      visibilityType: 'scene',
      visibilityId: sceneId,
    },
    createdGeometries: [],
    selectedGeometryIds: [],
    createdData: [],
    selectedDataIds: [],
    ...emptyPendingData(),
  };
}
