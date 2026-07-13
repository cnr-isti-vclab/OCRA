import type { AnnotationCreationDraft } from './types';

export function createDefaultCreationDraft(sceneId: string): AnnotationCreationDraft {
  return {
    step: 'setup',
    geometryChoice: 'new',
    dataChoice: 'new',
    geometryScope: {
      referenceType: 'scene',
      referenceId: sceneId,
    },
    dataVisibility: {
      visibilityType: 'scene',
      visibilityId: sceneId,
    },
    multiSide: null,
    draftShapes: [],
    draftGeometryViewerId: null,
    selectedGeometryIds: [],
    selectedDataIds: [],
    newDataLabel: '',
    newDataDescription: '',
    newDataClass: null,
    newDataContent: {},
  };
}
