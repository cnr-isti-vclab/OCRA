import type { ReactNode } from 'react';
import type { AnnotationCreationDraft } from './types';
import {
  canCompleteDataStep,
  canCompleteGeometryStep,
} from './annotationCreationValidation';

export type { AnnotationScopeOption } from './types';

export interface AnnotationCreationActionBarProps {
  draft: AnnotationCreationDraft;
  creating: boolean;
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
  const showCommitStatus = isCommitting;
  const doneEnabled = draft.step === 'geometry'
    ? canCompleteGeometryStep(draft).ok
    : draft.step === 'data'
      ? canCompleteDataStep(draft).ok
      : false;

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
        ) : (
          <button
            type="button"
            className={['btn btn-outline-primary', nextButtonClassName].filter(Boolean).join(' ')}
            disabled={!doneEnabled}
            onClick={onNext}
          >
            <i className="bi bi-check-lg me-2" aria-hidden />Done
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Scope selectors were removed from the creation chrome (Phase B): scene defaults
 * from {@link createDefaultCreationDraft} + remembered setup are enough for now.
 * Reintroduce a dedicated scope UI here when asset/project scopes are needed again.
 */
