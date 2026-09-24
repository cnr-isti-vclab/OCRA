import type { AnnotationScopeType } from 'shared/annotation-types';
import type { ReactNode } from 'react';
import type {
  AnnotationCreationDraft,
  AnnotationScopeOption,
} from './types';
import {
  canBeginCreationWizard,
  dataResultCount,
  geometryResultCount,
} from './annotationCreationValidation';

export type { AnnotationScopeOption } from './types';

interface AnnotationCreationPanelProps {
  draft: AnnotationCreationDraft;
  scopeOptions: AnnotationScopeOption[];
  creating: boolean;
  setupError: string | null;
  onDraftChange: (patch: Partial<AnnotationCreationDraft>) => void;
  onCreate: () => void;
  onBack: () => void;
  onNext: () => void;
  /** Render actions in an external persistent footer instead of this panel. */
  showActions?: boolean;
}

export interface AnnotationCreationActionBarProps {
  draft: AnnotationCreationDraft;
  creating: boolean;
  onCreate: () => void;
  onBack: () => void;
  onNext: () => void;
  onCancel?: () => void;
  middleAction?: ReactNode;
  /** Optional presentation hook for the forward primary action. */
  nextButtonClassName?: string;
}

/** Shared workflow actions, usable in either an inline panel or a sticky workbench footer. */
export function AnnotationCreationActionBar({
  draft,
  creating,
  onBack,
  onNext,
  onCancel,
  middleAction,
  nextButtonClassName,
}: AnnotationCreationActionBarProps) {
  const isCommitting = draft.step === 'committing' || creating;
  const wizardActive = draft.step === 'geometry' || draft.step === 'data' || draft.step === 'committing';
  const nextButtonLabel = isCommitting
    ? 'Saving…'
    : draft.step === 'data'
        ? 'Confirm'
        : 'Done';

  return (
    <div className="d-grid align-items-center gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <div className="d-flex justify-content-start">
        {onCancel ? (
          <button type="button" className="btn btn-outline-secondary me-2" disabled={isCommitting} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="btn btn-outline-secondary" disabled={!wizardActive || isCommitting} onClick={onBack}>
          Back
        </button>
      </div>
      <div>{middleAction}</div>
      <div className="d-flex justify-content-end">
        <button type="button" className={`btn btn-primary ${nextButtonClassName ?? ''}`} disabled={isCommitting} onClick={onNext} aria-busy={isCommitting}>
          {nextButtonLabel}
        </button>
      </div>
    </div>
  );
}

function ScopeSelectors({
  draft,
  scopeOptions,
  onDraftChange,
}: {
  draft: AnnotationCreationDraft;
  scopeOptions: AnnotationScopeOption[];
  onDraftChange: (patch: Partial<AnnotationCreationDraft>) => void;
}) {
  const handleGeometryScopeType = (referenceType: AnnotationScopeType) => {
    const nextId = scopeOptions.find((option) => option.type === referenceType)?.id ?? '';
    onDraftChange({
      geometryScope: { referenceType, referenceId: nextId },
    });
  };

  const handleDataScopeType = (visibilityType: AnnotationScopeType) => {
    const nextId = scopeOptions.find((option) => option.type === visibilityType)?.id ?? '';
    onDraftChange({
      dataVisibility: { visibilityType, visibilityId: nextId },
    });
  };

  const geometryOptions = scopeOptions.filter((o) => o.type === draft.geometryScope.referenceType);
  const dataOptions = scopeOptions.filter((o) => o.type === draft.dataVisibility.visibilityType);

  return (
    <div className="d-flex flex-column gap-2 mb-3">
      <div>
        <div className="small fw-semibold mb-1">Geometry scope</div>
        <div className="d-flex gap-2">
          <select
            className="form-select form-select-sm"
            value={draft.geometryScope.referenceType}
            onChange={(e) => handleGeometryScopeType(e.target.value as AnnotationScopeType)}
            aria-label="Geometry scope type"
          >
            <option value="scene">Scene</option>
            <option value="asset">Asset</option>
          </select>
          <select
            className="form-select form-select-sm"
            value={draft.geometryScope.referenceId}
            onChange={(e) => onDraftChange({
              geometryScope: { ...draft.geometryScope, referenceId: e.target.value },
            })}
            aria-label="Geometry scope"
          >
            {geometryOptions.map((option) => (
              <option key={`${option.type}:${option.id}`} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <div className="small fw-semibold mb-1">Data visibility</div>
        <div className="d-flex gap-2">
          <select
            className="form-select form-select-sm"
            value={draft.dataVisibility.visibilityType}
            onChange={(e) => handleDataScopeType(e.target.value as AnnotationScopeType)}
            aria-label="Data visibility type"
          >
            <option value="scene">Scene</option>
            <option value="asset">Asset</option>
          </select>
          <select
            className="form-select form-select-sm"
            value={draft.dataVisibility.visibilityId}
            onChange={(e) => onDraftChange({
              dataVisibility: { ...draft.dataVisibility, visibilityId: e.target.value },
            })}
            aria-label="Data visibility scope"
          >
            {dataOptions.map((option) => (
              <option key={`${option.type}:${option.id}`} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function AnnotationCreationPanel({
  draft,
  scopeOptions,
  creating,
  setupError,
  onDraftChange,
  onCreate,
  onBack,
  onNext,
  showActions = true,
}: AnnotationCreationPanelProps) {
  const isCommitting = draft.step === 'committing' || creating;
  const awaitingStart = draft.step === 'geometry' && draft.geometryMode === null;
  const startEnabled = awaitingStart && canBeginCreationWizard(draft) && !isCommitting;
  const nGeometries = geometryResultCount(draft);
  const nData = dataResultCount(draft);

  const handleStart = () => {
    onDraftChange({ geometryMode: 'new', dataMode: null });
    onCreate();
  };

  return (
    <div className="border rounded p-3 mb-3 bg-light-subtle">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {isCommitting
          ? 'Saving annotation creation'
          : draft.step === 'geometry'
            ? 'Geometry step'
            : draft.step === 'data'
              ? 'Data step'
              : 'Creation setup'}
      </div>

      <ScopeSelectors draft={draft} scopeOptions={scopeOptions} onDraftChange={onDraftChange} />

      {awaitingStart ? (
        <>
          <p className="small text-muted mb-2">Draw in the viewer or choose existing geometry after starting.</p>
          <button type="button" className="btn btn-primary w-100" disabled={!startEnabled} onClick={handleStart}>
            Start
          </button>
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
          ) : null}
        </>
      ) : (
        <div className="small">
          <div className="fw-semibold mb-1">
            {draft.step === 'committing'
              ? 'Saving annotation…'
              : draft.step === 'geometry'
                ? 'Geometry step'
                : 'Data step'}
          </div>
          {isCommitting ? (
            <p className="text-muted mb-2">
              Persisting geometry, data, and links. Please wait.
            </p>
          ) : (
            <p className="text-muted mb-2">
              {draft.step === 'geometry'
                ? draft.geometryMode === 'new'
                  ? 'Draw a geometry in the viewer. You can adjust it before continuing.'
                  : 'Select one or more geometries in the viewer that match the chosen scope.'
                : draft.dataMode === 'new'
                  ? 'Create annotation data using the form below, then confirm.'
                  : draft.dataMode === 'choose'
                    ? 'Search and select annotation data records below.'
                    : 'Confirm to save geometry only, or add data before finishing.'}
            </p>
          )}
          <div className="text-muted">
            {draft.step === 'geometry' && draft.geometryMode === 'new' ? (
              <>
                Created geometries:
                {' '}
                {draft.createdGeometries.length}
                <br />
              </>
            ) : null}
            {draft.step === 'geometry' && draft.geometryMode === 'choose' ? (
              <>
                Selected geometries:
                {' '}
                {draft.selectedGeometryIds.length}
                <br />
              </>
            ) : null}
            {draft.step === 'data' && draft.dataMode === 'new' ? (
              <>
                Draft label:
                {' '}
                {draft.pendingDataLabel.trim().length > 0 ? draft.pendingDataLabel : 'not set'}
                <br />
              </>
            ) : null}
            {draft.step === 'data' && draft.dataMode === 'choose' ? (
              <>
                Selected data:
                {' '}
                {draft.selectedDataIds.length}
                <br />
              </>
            ) : null}
            Geometries:
            {' '}
            {nGeometries}
            <br />
            Data:
            {' '}
            {nData}
          </div>
        </div>
      )}

      {showActions && !awaitingStart ? (
        <div className="mt-3">
          <AnnotationCreationActionBar
            draft={draft}
            creating={creating}
            onCreate={onCreate}
            onBack={onBack}
            onNext={onNext}
          />
        </div>
      ) : null}
    </div>
  );
}
