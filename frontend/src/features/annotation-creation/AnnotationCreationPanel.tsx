import type { AnnotationScopeType } from 'shared/annotation-types';
import type {
  AnnotationCreationDraft,
  AnnotationCreationMultiSide,
  AnnotationEntityChoice,
  AnnotationScopeOption,
} from './types';
import {
  bothSidesSearch,
  canBeginCreationWizard,
  normalizeMultiSideForChoices,
} from './annotationCreationValidation';

export type { AnnotationScopeOption } from './types';

interface EntityChoiceGroupProps {
  idPrefix: string;
  title: string;
  choice: AnnotationEntityChoice;
  scopeType: AnnotationScopeType;
  scopeId: string;
  scopeOptions: AnnotationScopeOption[];
  onChoiceChange: (choice: AnnotationEntityChoice) => void;
  onScopeTypeChange: (scopeType: AnnotationScopeType) => void;
  onScopeIdChange: (scopeId: string) => void;
}

function EntityChoiceGroup({
  idPrefix,
  title,
  choice,
  scopeType,
  scopeId,
  scopeOptions,
  onChoiceChange,
  onScopeTypeChange,
  onScopeIdChange,
}: EntityChoiceGroupProps) {
  const filteredOptions = scopeOptions.filter((option) => option.type === scopeType);

  return (
    <div className="border rounded p-2 bg-white">
      <div className="fw-semibold small mb-2">{title}</div>
      <div className="d-flex flex-column gap-1 mb-2">
        {(['new', 'search', 'void'] as const).map((option) => (
          <div className="form-check" key={option}>
            <input
              className="form-check-input"
              type="radio"
              name={`${idPrefix}-choice`}
              id={`${idPrefix}-choice-${option}`}
              checked={choice === option}
              onChange={() => onChoiceChange(option)}
            />
            <label className="form-check-label small" htmlFor={`${idPrefix}-choice-${option}`}>
              {option === 'new' ? 'New' : option === 'search' ? 'Search' : 'Void'}
            </label>
          </div>
        ))}
      </div>

      {choice !== 'void' ? (
        <>
          <div className="small text-muted mb-1">Scope</div>
          <div className="d-flex gap-2 mb-2">
            <select
              className="form-select form-select-sm"
              value={scopeType}
              onChange={(e) => onScopeTypeChange(e.target.value as AnnotationScopeType)}
              aria-label={`${title} scope type`}
            >
              <option value="scene">Scene</option>
              <option value="asset">Asset</option>
            </select>
            <select
              className="form-select form-select-sm"
              value={scopeId}
              onChange={(e) => onScopeIdChange(e.target.value)}
              aria-label={`${title} scope`}
            >
              {filteredOptions.map((option) => (
                <option key={`${option.type}:${option.id}`} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface AnnotationCreationPanelProps {
  draft: AnnotationCreationDraft;
  scopeOptions: AnnotationScopeOption[];
  creating: boolean;
  setupError: string | null;
  onDraftChange: (patch: Partial<AnnotationCreationDraft>) => void;
  onCreate: () => void;
  onBack: () => void;
  onNext: () => void;
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
}: AnnotationCreationPanelProps) {
  const isSetup = draft.step === 'setup';
  const showMultiSide = bothSidesSearch(draft);
  const createEnabled = isSetup && canBeginCreationWizard(draft) && !creating;
  const wizardActive = draft.step === 'geometry' || draft.step === 'data';

  const handleGeometryChoice = (choice: AnnotationEntityChoice) => {
    onDraftChange({
      geometryChoice: choice,
      multiSide: normalizeMultiSideForChoices(choice, draft.dataChoice, draft.multiSide),
    });
  };

  const handleDataChoice = (choice: AnnotationEntityChoice) => {
    onDraftChange({
      dataChoice: choice,
      multiSide: normalizeMultiSideForChoices(draft.geometryChoice, choice, draft.multiSide),
    });
  };

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

  return (
    <div className="border rounded p-3 mb-3 bg-light-subtle">
      {isSetup ? (
        <>
          <div className="row g-2">
            <div className="col-md-6">
              <EntityChoiceGroup
                idPrefix="creation-geometry"
                title="Geometry"
                choice={draft.geometryChoice}
                scopeType={draft.geometryScope.referenceType}
                scopeId={draft.geometryScope.referenceId}
                scopeOptions={scopeOptions}
                onChoiceChange={handleGeometryChoice}
                onScopeTypeChange={handleGeometryScopeType}
                onScopeIdChange={(referenceId) =>
                  onDraftChange({ geometryScope: { ...draft.geometryScope, referenceId } })
                }
              />
            </div>
            <div className="col-md-6">
              <EntityChoiceGroup
                idPrefix="creation-data"
                title="Data"
                choice={draft.dataChoice}
                scopeType={draft.dataVisibility.visibilityType}
                scopeId={draft.dataVisibility.visibilityId}
                scopeOptions={scopeOptions}
                onChoiceChange={handleDataChoice}
                onScopeTypeChange={handleDataScopeType}
                onScopeIdChange={(visibilityId) =>
                  onDraftChange({ dataVisibility: { ...draft.dataVisibility, visibilityId } })
                }
              />
            </div>
          </div>

          {showMultiSide ? (
            <div className="mt-2">
              <div className="small text-muted mb-1">Multiple selection allowed on</div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Multiple selection side">
                {(['geometry', 'data'] as const).map((side) => (
                  <span key={side}>
                    <input
                      type="radio"
                      className="btn-check"
                      name="creation-multi-side"
                      id={`creation-multi-${side}`}
                      checked={draft.multiSide === side}
                      onChange={() => onDraftChange({ multiSide: side as AnnotationCreationMultiSide })}
                    />
                    <label className="btn btn-outline-secondary" htmlFor={`creation-multi-${side}`}>
                      {side === 'geometry' ? 'Geometry' : 'Data'}
                    </label>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
          ) : null}
        </>
      ) : (
        <div className="small">
          <div className="fw-semibold mb-1">
            {draft.step === 'geometry' ? 'Geometry step' : 'Data step'}
          </div>
          <p className="text-muted mb-2">
            {draft.step === 'geometry'
              ? 'Draw or select geometries in the viewer (viewer integration arrives in the next milestone).'
              : 'Create or search annotation data in the panel list (data step UI arrives in the next milestone).'}
          </p>
          <div className="text-muted">
            Geometry:
            {' '}
            {draft.geometryChoice}
            {draft.geometryChoice !== 'void'
              ? ` (${draft.geometryScope.referenceType}: ${draft.geometryScope.referenceId})`
              : ''}
            <br />
            Data:
            {' '}
            {draft.dataChoice}
            {draft.dataChoice !== 'void'
              ? ` (${draft.dataVisibility.visibilityType}: ${draft.dataVisibility.visibilityId})`
              : ''}
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={!wizardActive || creating}
          onClick={onBack}
        >
          Back
        </button>

        {isSetup ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!createEnabled}
            onClick={onCreate}
          >
            Create
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={creating}
            onClick={onNext}
          >
            {draft.step === 'geometry' && draft.dataChoice === 'void' ? 'Confirm' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}
