import type {
  AnnotationCreationDraft,
  AnnotationCreationRememberedSetup,
  CreatedGeometryDraft,
} from './types';

export function extractCreationSetup(
  draft: Pick<AnnotationCreationDraft, 'geometryScope' | 'dataVisibility' | 'drawingMode'>,
): AnnotationCreationRememberedSetup {
  return {
    geometryScope: { ...draft.geometryScope },
    dataVisibility: { ...draft.dataVisibility },
    drawingMode: draft.drawingMode,
  };
}

export function applyRememberedCreationSetup(
  base: AnnotationCreationDraft,
  remembered: AnnotationCreationRememberedSetup,
): AnnotationCreationDraft {
  return {
    ...base,
    geometryScope: { ...remembered.geometryScope },
    dataVisibility: { ...remembered.dataVisibility },
    drawingMode: remembered.drawingMode,
  };
}

const SETUP_PATCH_KEYS: Array<keyof AnnotationCreationRememberedSetup> = [
  'geometryScope',
  'dataVisibility',
  'drawingMode',
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
