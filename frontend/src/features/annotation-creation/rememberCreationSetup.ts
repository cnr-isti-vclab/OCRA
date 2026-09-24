import type {
  AnnotationCreationDraft,
  AnnotationCreationRememberedSetup,
  CreatedGeometryDraft,
} from './types';

export function extractCreationSetup(
  draft: Pick<AnnotationCreationDraft, 'geometryScope' | 'dataVisibility' | 'drawingMode' | 'stepOrder'>,
): AnnotationCreationRememberedSetup {
  return {
    geometryScope: { ...draft.geometryScope },
    dataVisibility: { ...draft.dataVisibility },
    drawingMode: draft.drawingMode,
    stepOrder: draft.stepOrder,
  };
}

export function applyRememberedCreationSetup(
  base: AnnotationCreationDraft,
  remembered: AnnotationCreationRememberedSetup,
): AnnotationCreationDraft {
  const stepOrder = remembered.stepOrder ?? 'geometry-first';
  return {
    ...base,
    geometryScope: { ...remembered.geometryScope },
    dataVisibility: { ...remembered.dataVisibility },
    drawingMode: remembered.drawingMode,
    stepOrder,
    step: stepOrder === 'data-first' ? 'data' : 'geometry',
  };
}

const SETUP_PATCH_KEYS: Array<keyof AnnotationCreationRememberedSetup> = [
  'geometryScope',
  'dataVisibility',
  'drawingMode',
  'stepOrder',
];

export function patchTouchesCreationSetup(
  patch: Partial<AnnotationCreationDraft>,
): boolean {
  return SETUP_PATCH_KEYS.some((key) => key in patch);
}

export function lastCreatedGeometry(
  draft: Pick<AnnotationCreationDraft, 'createdGeometries'> | null | undefined,
): CreatedGeometryDraft | null {
  if (!draft || draft.createdGeometries.length === 0) {
    return null;
  }
  return draft.createdGeometries[draft.createdGeometries.length - 1] ?? null;
}

export function lastCreatedGeometryViewerId(
  draft: Pick<AnnotationCreationDraft, 'createdGeometries'> | null | undefined,
): string | null {
  return lastCreatedGeometry(draft)?.viewerId ?? null;
}
