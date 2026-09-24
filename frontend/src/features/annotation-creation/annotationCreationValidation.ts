import type {
  AnnotationCreationDraft,
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

/** Count of data from the active data mode (created XOR selected). */
export function dataResultCount(
  draft: Pick<
    AnnotationCreationDraft,
    | 'dataMode'
    | 'createdData'
    | 'selectedDataIds'
    | 'pendingDataLabel'
  >,
): number {
  if (draft.dataMode === 'new') {
    if (draft.createdData.length > 0) {
      return draft.createdData.length;
    }
    return isNonEmpty(draft.pendingDataLabel) ? 1 : 0;
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
 * Geometry step Done is always allowed (including N=0 → old skip).
 */
export function canCompleteGeometryStep(
  _draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  return { ok: true };
}

/**
 * Data-step Done rules:
 * - N=0 → only New data; need K≥1 created
 * - N≥1 created geos → K=0 OK (geometry-only); if data mode set, results must be valid
 * - N≥1 chosen geos → K≥1 required
 * - when both N>0 and K>0 → N===1 || K===1
 */
export function canCompleteDataStep(
  draft: AnnotationCreationDraft,
): AnnotationCreationValidationResult {
  const nCreated = draft.geometryMode === 'new' ? draft.createdGeometries.length : 0;
  const nChosen = draft.geometryMode === 'choose' ? draft.selectedGeometryIds.length : 0;
  const n = nCreated + nChosen;
  const k = dataResultCount(draft);
  const kCreated = draft.dataMode === 'new' ? Math.max(draft.createdData.length, isNonEmpty(draft.pendingDataLabel) ? 1 : 0) : 0;
  const kChosen = draft.dataMode === 'choose' ? draft.selectedDataIds.length : 0;

  if (nCreated > 0 && nChosen > 0) {
    return { ok: false, message: 'Cannot mix created and chosen geometries.' };
  }
  if (draft.createdData.length > 0 && kChosen > 0) {
    return { ok: false, message: 'Cannot mix created and chosen data.' };
  }

  if (n === 0) {
    if (draft.dataMode !== 'new') {
      return { ok: false, message: 'Create at least one data record when no geometry was added.' };
    }
    if (kCreated < 1) {
      return { ok: false, message: 'Create at least one data record before finishing.' };
    }
    return { ok: true };
  }

  if (nChosen > 0) {
    if (k < 1) {
      return {
        ok: false,
        message: 'Create or choose data to link to the selected geometries.',
      };
    }
    if (n > 1 && k > 1) {
      return {
        ok: false,
        message: 'When multiple geometries are selected, only one data record is allowed.',
      };
    }
    return { ok: true };
  }

  // nCreated > 0: geometry-only (K=0) is allowed when data mode is unset or empty new/choose.
  if (k === 0) {
    return { ok: true };
  }
  if (n > 1 && k > 1) {
    return {
      ok: false,
      message: 'When multiple geometries are created, only one data record is allowed.',
    };
  }
  return { ok: true };
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

  const n = geometryResultCount(draft);
  const k = dataResultCount(draft);
  if (n === 0 && k === 0) {
    return { ok: false, message: 'Nothing to create or link.' };
  }

  return canCompleteDataStep(draft);
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

export function allowsMultipleGeometrySelection(
  draft: Pick<AnnotationCreationDraft, 'geometryMode'>,
): boolean {
  return draft.geometryMode === 'choose';
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
 * Whether another data item may be added (New or Choose).
 * When N>1 geometries, at most one data result is allowed.
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
    | 'pendingDataLabel'
  >,
): boolean {
  const n = geometryResultCount(draft);
  const k = dataResultCount(draft);
  if (n > 1) {
    return k < 1;
  }
  return true;
}

/** Choose is unavailable when geometry was skipped (N=0). */
export function canUseDataChooseMode(
  draft: Pick<AnnotationCreationDraft, 'geometryMode' | 'createdGeometries' | 'selectedGeometryIds'>,
): boolean {
  return geometryResultCount(draft) > 0;
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
 * Data items to persist: confirmed createdData, or a single pending form if still open/unpushed.
 */
export function resolveCreatedDataForCommit(
  draft: Pick<
    AnnotationCreationDraft,
    | 'dataMode'
    | 'createdData'
    | 'pendingDataLabel'
    | 'pendingDataDescription'
    | 'pendingDataClass'
    | 'pendingDataContent'
  >,
): CreatedDataDraft[] {
  if (draft.dataMode !== 'new') {
    return [];
  }
  if (draft.createdData.length > 0) {
    return [...draft.createdData];
  }
  const pending = pendingDataAsCreated(draft);
  return pending ? [pending] : [];
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
