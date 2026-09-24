import type {
  AnnotationCreationDraft,
  AnnotationCreationStep,
  AnnotationCreationStepOrder,
  CreatedDataDraft,
  CreatedGeometryDraft,
} from './types';

export interface AnnotationCreationValidationResult {
  ok: boolean;
  message?: string;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isGeometryFirst(
  draft: Pick<AnnotationCreationDraft, 'stepOrder'>,
): boolean {
  return draft.stepOrder !== 'data-first';
}

export function firstCreationStep(
  stepOrder: AnnotationCreationStepOrder,
): AnnotationCreationStep {
  return stepOrder === 'data-first' ? 'data' : 'geometry';
}

export function secondCreationStep(
  stepOrder: AnnotationCreationStepOrder,
): AnnotationCreationStep {
  return stepOrder === 'data-first' ? 'geometry' : 'data';
}

export function isOnFirstCreationStep(
  draft: Pick<AnnotationCreationDraft, 'step' | 'stepOrder'>,
): boolean {
  return draft.step === firstCreationStep(draft.stepOrder);
}

export function isOnSecondCreationStep(
  draft: Pick<AnnotationCreationDraft, 'step' | 'stepOrder'>,
): boolean {
  return draft.step === secondCreationStep(draft.stepOrder);
}

/** Count of geometries from the active geometry mode (created XOR selected). */
export function geometryResultCount(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'createdGeometries' | 'selectedGeometryIds'>,
): number {
  if (draft.geometryMode === 'new') {
    return draft.createdGeometries.length;
  }
  if (draft.geometryMode === 'choose') {
    return draft.selectedGeometryIds.length;
  }
  return 0;
}

/** Count of data from the active data mode (created XOR selected). Pending form does not count. */
export function dataResultCount(
  draft: Pick<
    AnnotationCreationDraft,
    | 'dataMode'
    | 'createdData'
    | 'selectedDataIds'
  >,
): number {
  if (draft.dataMode === 'new') {
    return draft.createdData.length;
  }
  if (draft.dataMode === 'choose') {
    return draft.selectedDataIds.length;
  }
  return 0;
}

export function hasCreatedGeometries(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'createdGeometries'>,
): boolean {
  return draft.geometryMode === 'new' && draft.createdGeometries.length > 0;
}

export function hasChosenGeometries(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'selectedGeometryIds'>,
): boolean {
  return draft.geometryMode === 'choose' && draft.selectedGeometryIds.length > 0;
}

/**
 * Final commit / second-step rules (order-agnostic).
 * - N=0 → only New data; need K≥1 created
 * - K=0 → only New geometry; need N≥1 created
 * - chosen on either side requires the other side ≥1
 * - when both N>0 and K>0 → N===1 || K===1
 * - geometry-only / data-only: other mode must be unset (not empty New/Choose)
 */
export function canCommitCreationDraft(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  const nCreated = draft.geometryMode === 'new' ? draft.createdGeometries.length : 0;
  const nChosen = draft.geometryMode === 'choose' ? draft.selectedGeometryIds.length : 0;
  const n = nCreated + nChosen;
  const k = dataResultCount(draft);
  const kCreated = draft.dataMode === 'new' ? draft.createdData.length : 0;
  const kChosen = draft.dataMode === 'choose' ? draft.selectedDataIds.length : 0;

  if (nCreated > 0 && nChosen > 0) {
    return { ok: false, message: 'Cannot mix created and chosen geometries.' };
  }
  if (draft.createdData.length > 0 && kChosen > 0) {
    return { ok: false, message: 'Cannot mix created and chosen data.' };
  }

  if (n === 0 && k === 0) {
    return { ok: false, message: 'Nothing to create or link.' };
  }

  if (n === 0) {
    if (draft.dataMode !== 'new' || kCreated < 1) {
      return { ok: false, message: 'Create at least one data record when no geometry was added.' };
    }
    if (draft.geometryMode === 'new' || draft.geometryMode === 'choose') {
      return {
        ok: false,
        message: 'Add a geometry, or leave geometry New/Choose unselected for data-only.',
      };
    }
    return { ok: true };
  }

  if (k === 0) {
    if (draft.geometryMode !== 'new' || nCreated < 1) {
      return { ok: false, message: 'Create at least one geometry when no data was added.' };
    }
    if (draft.dataMode === 'new' || draft.dataMode === 'choose') {
      return {
        ok: false,
        message: 'Add data, or leave data New/Choose unselected for geometry-only.',
      };
    }
    return { ok: true };
  }

  if (nChosen > 0 && k < 1) {
    return { ok: false, message: 'Create or choose data to link to the selected geometries.' };
  }
  if (kChosen > 0 && n < 1) {
    return { ok: false, message: 'Create or choose geometry to link to the selected data.' };
  }
  if (n > 1 && k > 1) {
    return {
      ok: false,
      message: 'When multiple items exist on both sides, only a star layout (1×N or N×1) is allowed.',
    };
  }
  return { ok: true };
}

/**
 * Geometry-step Done:
 * - first step (geometry-first) → always allowed (including N=0)
 * - second step (data-first) → commit rules
 */
export function canCompleteGeometryStep(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  if (isGeometryFirst(draft)) {
    return { ok: true };
  }
  return canCommitCreationDraft(draft);
}

/**
 * Data-step Done:
 * - first step (data-first) → always allowed (including K=0)
 * - second step (geometry-first) → commit rules
 */
export function canCompleteDataStep(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  if (!isGeometryFirst(draft)) {
    return { ok: true };
  }
  return canCommitCreationDraft(draft);
}

export function validateCreationDraftForCommit(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  if (!isNonEmpty(draft.geometryScope.referenceId)) {
    return { ok: false, message: 'Geometry scope is required.' };
  }
  if (!isNonEmpty(draft.dataVisibility.visibilityId)) {
    return { ok: false, message: 'Data visibility scope is required.' };
  }
  return canCommitCreationDraft(draft);
}

/** @deprecated Use canCompleteGeometryStep / canCompleteDataStep. */
export function validateCreationStep(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  if (draft.step === 'geometry') {
    return canCompleteGeometryStep(draft);
  }
  if (draft.step === 'data') {
    return canCompleteDataStep(draft);
  }
  return { ok: false, message: 'Creation step is not ready to advance.' };
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

/** Star-topology guard used before linking. */
export function isValidLinkCardinality(geometryCount: number, dataCount: number): boolean {
  if (geometryCount === 0 || dataCount === 0) {
    return true;
  }
  return geometryCount === 1 || dataCount === 1;
}

/**
 * Multiple geometry selection only when at most one data result exists.
 */
export function allowsMultipleGeometrySelection(
  draft: Pick<
    AnnotationCreationDraft,
    'geometryMode' | 'dataMode' | 'createdData' | 'selectedDataIds'
  >,
): boolean {
  if (draft.geometryMode !== 'choose') {
    return false;
  }
  return dataResultCount(draft) <= 1;
}

/**
 * Multiple data selection only when at most one geometry result exists.
 */
export function allowsMultipleDataSelection(
  draft: Pick<
    AnnotationCreationDraft,
    'dataMode' | 'geometryMode' | 'createdGeometries' | 'selectedGeometryIds'
  >,
): boolean {
  if (draft.dataMode !== 'choose') {
    return false;
  }
  return geometryResultCount(draft) <= 1;
}

/** Disable Choose once any geometry has been created. */
export function canSwitchToGeometryChoose(
  draft: Pick<AnnotationCreationDraft, 'createdGeometries'>,
): boolean {
  return draft.createdGeometries.length === 0;
}

/** Disable Choose once any data has been created. */
export function canSwitchToDataChoose(
  draft: Pick<AnnotationCreationDraft, 'createdData'>,
): boolean {
  return draft.createdData.length === 0;
}

/**
 * Whether another data item may be added.
 * When N>1 geometries, at most one confirmed data result is allowed.
 */
export function canAddMoreData(
  draft: Pick<
    AnnotationCreationDraft,
    | 'geometryMode'
    | 'createdGeometries'
    | 'selectedGeometryIds'
    | 'dataMode'
    | 'createdData'
    | 'selectedDataIds'
  >,
): boolean {
  const n = geometryResultCount(draft);
  const k = draft.dataMode === 'new'
    ? draft.createdData.length
    : draft.dataMode === 'choose'
      ? draft.selectedDataIds.length
      : 0;
  if (n > 1) {
    return k < 1;
  }
  return true;
}

/**
 * Whether another geometry item may be added.
 * When K>1 data, at most one confirmed geometry result is allowed.
 */
export function canAddMoreGeometry(
  draft: Pick<
    AnnotationCreationDraft,
    | 'geometryMode'
    | 'createdGeometries'
    | 'selectedGeometryIds'
    | 'dataMode'
    | 'createdData'
    | 'selectedDataIds'
  >,
): boolean {
  const k = dataResultCount(draft);
  const n = draft.geometryMode === 'new'
    ? draft.createdGeometries.length
    : draft.geometryMode === 'choose'
      ? draft.selectedGeometryIds.length
      : 0;
  if (k > 1) {
    return n < 1;
  }
  return true;
}

/**
 * Data Choose availability.
 * - Geometry-first (data is second): needs N>0.
 * - Data-first (data is first): always available.
 */
export function canUseDataChooseMode(
  draft: Pick<
    AnnotationCreationDraft,
    'stepOrder' | 'step' | 'geometryMode' | 'createdGeometries' | 'selectedGeometryIds'
  >,
): boolean {
  if (!isGeometryFirst(draft)) {
    return true;
  }
  return geometryResultCount(draft) > 0;
}

/**
 * Geometry Choose availability.
 * - Data-first (geometry is second): needs K>0.
 * - Geometry-first (geometry is first): always available.
 */
export function canUseGeometryChooseMode(
  draft: Pick<
    AnnotationCreationDraft,
    'stepOrder' | 'step' | 'dataMode' | 'createdData' | 'selectedDataIds'
  >,
): boolean {
  if (isGeometryFirst(draft)) {
    return true;
  }
  return dataResultCount(draft) > 0;
}

/** True when step order can still be flipped (no authored results yet). */
export function canChangeCreationStepOrder(
  draft: Pick<
    AnnotationCreationDraft,
    | 'step'
    | 'stepOrder'
    | 'createdGeometries'
    | 'selectedGeometryIds'
    | 'createdData'
    | 'selectedDataIds'
  >,
): boolean {
  if (!isOnFirstCreationStep(draft)) {
    return false;
  }
  return (
    draft.createdGeometries.length === 0
    && draft.selectedGeometryIds.length === 0
    && draft.createdData.length === 0
    && draft.selectedDataIds.length === 0
  );
}

export function emptyPendingData(): Pick<
  AnnotationCreationDraft,
  'pendingDataLabel' | 'pendingDataDescription' | 'pendingDataClass' | 'pendingDataContent'
> {
  return {
    pendingDataLabel: '',
    pendingDataDescription: '',
    pendingDataClass: null,
    pendingDataContent: {},
  };
}

export function pendingDataAsCreated(
  draft: Pick<
    AnnotationCreationDraft,
    'pendingDataLabel' | 'pendingDataDescription' | 'pendingDataClass' | 'pendingDataContent'
  >,
): CreatedDataDraft | null {
  if (!isNonEmpty(draft.pendingDataLabel)) {
    return null;
  }
  return {
    label: draft.pendingDataLabel.trim(),
    description: draft.pendingDataDescription,
    class: draft.pendingDataClass,
    content: draft.pendingDataContent,
  };
}

/**
 * Data items to persist from confirmed createdData entries.
 */
export function resolveCreatedDataForCommit(
  draft: Pick<
    AnnotationCreationDraft,
    | 'dataMode'
    | 'createdData'
  >,
): CreatedDataDraft[] {
  if (draft.dataMode !== 'new') {
    return [];
  }
  return [...draft.createdData];
}

export function resolveCreatedGeometriesForCommit(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'createdGeometries'>,
): CreatedGeometryDraft[] {
  if (draft.geometryMode !== 'new') {
    return [];
  }
  return [...draft.createdGeometries];
}

/** Scopes must be present to open the wizard. */
export function canBeginCreationWizard(
  draft: Pick<AnnotationCreationDraft, 'geometryScope' | 'dataVisibility'>,
): boolean {
  return (
    isNonEmpty(draft.geometryScope.referenceId)
    && isNonEmpty(draft.dataVisibility.visibilityId)
  );
}
