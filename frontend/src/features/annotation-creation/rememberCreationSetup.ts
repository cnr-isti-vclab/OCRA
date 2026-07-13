import type { AnnotationCreationDraft, AnnotationCreationSetupDraft } from './types';

export function extractCreationSetup(
  draft: AnnotationCreationSetupDraft,
): AnnotationCreationSetupDraft {
  return {
    geometryChoice: draft.geometryChoice,
    dataChoice: draft.dataChoice,
    geometryScope: { ...draft.geometryScope },
    dataVisibility: { ...draft.dataVisibility },
    multiSide: draft.multiSide,
  };
}

export function applyRememberedCreationSetup(
  base: AnnotationCreationDraft,
  remembered: AnnotationCreationSetupDraft,
): AnnotationCreationDraft {
  return {
    ...base,
    geometryChoice: remembered.geometryChoice,
    dataChoice: remembered.dataChoice,
    geometryScope: { ...remembered.geometryScope },
    dataVisibility: { ...remembered.dataVisibility },
    multiSide: remembered.multiSide,
  };
}

const SETUP_PATCH_KEYS: Array<keyof AnnotationCreationSetupDraft> = [
  'geometryChoice',
  'dataChoice',
  'geometryScope',
  'dataVisibility',
  'multiSide',
];

export function patchTouchesCreationSetup(
  patch: Partial<AnnotationCreationDraft>,
): boolean {
  return SETUP_PATCH_KEYS.some((key) => key in patch);
}
