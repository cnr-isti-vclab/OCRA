import type { AnnotationScopeType } from 'shared/annotation-types';
import type { ReactNode } from 'react';
import type {
  AnnotationCreationDraft,
  AnnotationScopeOption,
} from './types';
import {
  canBeginCreationWizard,
  canChangeCreationStepOrder,
  dataResultCount,
  firstCreationStep,
  geometryResultCount,
} from './annotationCreationValidation';
import type { AnnotationCreationStepOrder } from './types';

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
  onNext: _onNext,
  onCancel,
  middleAction,
  nextButtonClassName,
}: AnnotationCreationActionBarProps) {
  const isCommitting = draft.step === 'committing' || creating;
  const wizardActive = draft.step === 'geometry' || draft.step === 'data' || draft.step === 'committing';
  // Geometry and data steps own Done in their New|Choose|Done groups.
  const showCommitStatus = isCommitting;

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
        {showCommitStatus ? (
          <button
            type="button"
            className={`btn btn-primary ${nextButtonClassName ?? ''}`}
            disabled
            aria-busy
          >
            Saving…
          </button>
        ) : null}
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
    onDraftChange({ geometryScope: { referenceType, referenceId: nextId } });
  };

  const handleDataScopeType = (visibilityType: AnnotationScopeType) => {
    const nextId = scopeOptions.find((option) => option.type === visibilityType)?.id ?? '';
    onDraftChange({ dataVisibility: { visibilityType, visibilityId: nextId } });
  };

  const geometryOptions = scopeOptions.filter((option) => option.type === draft.geometryScope.referenceType);
  const dataOptions = scopeOptions.filter((option) => option.type === draft.dataVisibility.visibilityType);

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

/**
 * Compact scope + status strip for creation (no New/Search/Void matrix).
 * Geometry/data New|Choose|Done live in their step components.
 */
export default function AnnotationCreationPanel({
  draft,
  scopeOptions,
  creating,
  setupError,
  onDraftChange,
  onCreate: _onCreate,
  onBack,
  onNext,
  showActions = true,
}: AnnotationCreationPanelProps) {
  const isCommitting = draft.step === 'committing' || creating;
  const scopesReady = canBeginCreationWizard(draft);
  const nGeometries = geometryResultCount(draft);
  const nData = dataResultCount(draft);
  const canChangeOrder = canChangeCreationStepOrder(draft) && !isCommitting;

  const handleStepOrderChange = (stepOrder: AnnotationCreationStepOrder) => {
    if (!canChangeOrder || stepOrder === draft.stepOrder) {
      return;
    }
    onDraftChange({
      stepOrder,
      step: firstCreationStep(stepOrder),
      geometryMode: null,
      dataMode: null,
    });
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

      <div className="mb-3">
        <div className="small fw-semibold mb-1">Order</div>
        <div className="btn-group w-100" role="group" aria-label="Creation step order">
          <button
            type="button"
            className={`btn btn-sm ${draft.stepOrder === 'geometry-first' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={draft.stepOrder === 'geometry-first'}
            disabled={!canChangeOrder}
            title={!canChangeOrder ? 'Clear drafts before changing order' : undefined}
            onClick={() => handleStepOrderChange('geometry-first')}
          >
            Geometry first
          </button>
          <button
            type="button"
            className={`btn btn-sm ${draft.stepOrder === 'data-first' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={draft.stepOrder === 'data-first'}
            disabled={!canChangeOrder}
            title={!canChangeOrder ? 'Clear drafts before changing order' : undefined}
            onClick={() => handleStepOrderChange('data-first')}
          >
            Data first
          </button>
        </div>
      </div>

      {!scopesReady ? (
        <p className="small text-muted mb-2">Select geometry scope and data visibility to continue.</p>
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
              Use New | Choose | Done in the step below.
            </p>
          )}
          <div className="text-muted">
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

      {setupError ? (
        <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
      ) : null}

      {showActions && scopesReady ? (
        <div className="mt-3">
          <AnnotationCreationActionBar
            draft={draft}
            creating={creating}
            onCreate={_onCreate}
            onBack={onBack}
            onNext={onNext}
          />
        </div>
      ) : null}
    </div>
  );
}
