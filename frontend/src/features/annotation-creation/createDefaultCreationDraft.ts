import type { AnnotationCreationDraft, AnnotationDrawingMode } from './types';
import { emptyPendingData } from './annotationCreationValidation';

export function createDefaultCreationDraft(
  sceneId: string,
  drawingMode: AnnotationDrawingMode = 'area',
): AnnotationCreationDraft {
  return {
    step: 'geometry',
    stepOrder: 'geometry-first',
    drawingMode,
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
