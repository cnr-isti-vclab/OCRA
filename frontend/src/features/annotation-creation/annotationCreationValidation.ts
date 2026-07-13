import type {
  AnnotationCreationDraft,
  AnnotationCreationSetupDraft,
  AnnotationEntityChoice,
} from './types';

export interface AnnotationCreationValidationResult {
  ok: boolean;
  message?: string;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function bothSidesVoid(setup: Pick<AnnotationCreationSetupDraft, 'geometryChoice' | 'dataChoice'>): boolean {
  return setup.geometryChoice === 'void' && setup.dataChoice === 'void';
}

export function bothSidesSearch(setup: Pick<AnnotationCreationSetupDraft, 'geometryChoice' | 'dataChoice'>): boolean {
  return setup.geometryChoice === 'search' && setup.dataChoice === 'search';
}

export function resolveInitialCreationStep(
  setup: Pick<AnnotationCreationSetupDraft, 'geometryChoice' | 'dataChoice'>,
): 'geometry' | 'data' {
  return setup.geometryChoice === 'void' ? 'data' : 'geometry';
}

export function validateCreationSetup(setup: AnnotationCreationSetupDraft): AnnotationCreationValidationResult {
  if (bothSidesVoid(setup)) {
    return { ok: false, message: 'Choose at least one of geometry or data to create.' };
  }

  if (setup.geometryChoice !== 'void') {
    if (!isNonEmpty(setup.geometryScope.referenceId)) {
      return { ok: false, message: 'Geometry scope is required.' };
    }
  }

  if (setup.dataChoice !== 'void') {
    if (!isNonEmpty(setup.dataVisibility.visibilityId)) {
      return { ok: false, message: 'Data visibility scope is required.' };
    }
  }

  if (bothSidesSearch(setup) && setup.multiSide !== 'geometry' && setup.multiSide !== 'data') {
    return { ok: false, message: 'When both sides use search, choose which side allows multiple selection.' };
  }

  return { ok: true };
}

export function canBeginCreationWizard(setup: AnnotationCreationSetupDraft): boolean {
  return validateCreationSetup(setup).ok;
}

export function normalizeMultiSideForChoices(
  geometryChoice: AnnotationEntityChoice,
  dataChoice: AnnotationEntityChoice,
  current: AnnotationCreationSetupDraft['multiSide'],
): AnnotationCreationSetupDraft['multiSide'] {
  if (geometryChoice === 'search' && dataChoice === 'search') {
    return current ?? 'geometry';
  }
  return null;
}

export function validateCreationDraftForCommit(draft: AnnotationCreationDraft): AnnotationCreationValidationResult {
  const setupValidation = validateCreationSetup(draft);
  if (!setupValidation.ok) {
    return setupValidation;
  }

  if (draft.geometryChoice === 'new' && draft.draftShapes.length === 0) {
    return { ok: false, message: 'Draw or define geometry before confirming.' };
  }

  if (draft.geometryChoice === 'search' && draft.selectedGeometryIds.length === 0) {
    return { ok: false, message: 'Select at least one geometry.' };
  }

  if (draft.dataChoice === 'search' && draft.selectedDataIds.length === 0) {
    return { ok: false, message: 'Select at least one annotation data record.' };
  }

  return { ok: true };
}

export function buildLinkPairs(
  geometryIds: string[],
  dataIds: string[],
): Array<{ geometryId: string; dataId: string }> {
  const pairs: Array<{ geometryId: string; dataId: string }> = [];
  for (const geometryId of geometryIds) {
    for (const dataId of dataIds) {
      pairs.push({ geometryId, dataId });
    }
  }
  return pairs;
}

export function allowsMultipleGeometrySelection(
  draft: Pick<AnnotationCreationDraft, 'geometryChoice' | 'dataChoice' | 'multiSide'>,
): boolean {
  if (draft.geometryChoice !== 'search') {
    return false;
  }
  if (draft.dataChoice !== 'search') {
    return true;
  }
  return draft.multiSide === 'geometry';
}

export function allowsMultipleDataSelection(
  draft: Pick<AnnotationCreationDraft, 'geometryChoice' | 'dataChoice' | 'multiSide'>,
): boolean {
  if (draft.dataChoice !== 'search') {
    return false;
  }
  if (draft.geometryChoice !== 'search') {
    return true;
  }
  return draft.multiSide === 'data';
}

export function validateCreationStep(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  if (draft.step === 'geometry') {
    if (draft.geometryChoice === 'new' && draft.draftShapes.length === 0) {
      return { ok: false, message: 'Draw a geometry in the viewer before continuing.' };
    }
    if (draft.geometryChoice === 'search' && draft.selectedGeometryIds.length === 0) {
      return { ok: false, message: 'Select at least one geometry in the viewer.' };
    }
    return { ok: true };
  }

  if (draft.step === 'data') {
    if (draft.dataChoice === 'new' && !isNonEmpty(draft.newDataLabel)) {
      return { ok: false, message: 'Create annotation data before continuing.' };
    }
    if (draft.dataChoice === 'search' && draft.selectedDataIds.length === 0) {
      return { ok: false, message: 'Select at least one annotation data record.' };
    }
    return { ok: true };
  }

  return { ok: false, message: 'Creation step is not ready to advance.' };
}
