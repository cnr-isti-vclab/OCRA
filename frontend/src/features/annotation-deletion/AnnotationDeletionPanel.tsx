import type { AnnotationDeletionDraft } from './types';
import {
  applyDeletionIntentAutoLink,
  canBeginDeletionWizard,
} from './annotationDeletionValidation';

interface AnnotationDeletionPanelProps {
  draft: AnnotationDeletionDraft;
  setupError: string | null;
  onDraftChange: (patch: Partial<AnnotationDeletionDraft>) => void;
  onStartDelete: () => void;
  onBack: () => void;
  onConfirmDelete: () => void;
}

export default function AnnotationDeletionPanel({
  draft,
  setupError,
  onDraftChange,
  onStartDelete,
  onBack,
  onConfirmDelete,
}: AnnotationDeletionPanelProps) {
  const isSetup = draft.step === 'setup';
  const isSelecting = draft.step === 'selecting';
  const isCommitting = draft.step === 'committing';
  const wizardActive = isSelecting || isCommitting;
  const startEnabled = isSetup && canBeginDeletionWizard(draft) && !isCommitting;
  const linkLocked = draft.deleteGeometry || draft.deleteData;
  const confirmEnabled = false; // M4: enable when basket is valid

  const patchIntent = (
    patch: Partial<Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>>,
  ) => {
    onDraftChange(applyDeletionIntentAutoLink(patch, draft));
  };

  return (
    <div className="border rounded p-3 mb-3 bg-light-subtle">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {isCommitting
          ? 'Saving annotation deletion'
          : isSelecting
            ? 'Deletion selection step'
            : 'Deletion setup'}
      </div>

      {isSetup ? (
        <>
          <div className="small fw-semibold mb-2">What to mark erasable</div>
          <div className="d-flex flex-column gap-1 mb-2">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="deletion-intent-link"
                checked={draft.deleteLink}
                disabled={linkLocked}
                onChange={(e) => patchIntent({ deleteLink: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="deletion-intent-link">
                Link
                {linkLocked ? (
                  <span className="text-muted"> (required with Geometry or Data)</span>
                ) : null}
              </label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="deletion-intent-geometry"
                checked={draft.deleteGeometry}
                onChange={(e) => patchIntent({ deleteGeometry: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="deletion-intent-geometry">
                Geometry
              </label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="deletion-intent-data"
                checked={draft.deleteData}
                onChange={(e) => patchIntent({ deleteData: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="deletion-intent-data">
                Data
              </label>
            </div>
          </div>
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
          ) : null}
        </>
      ) : (
        <div className="small">
          <div className="fw-semibold mb-1">
            {isCommitting ? 'Deleting…' : 'Select items to delete'}
          </div>
          <p className="text-muted mb-2">
            Selection and basket build in the next milestone. Confirm stays disabled until then.
          </p>
          <div className="text-muted">
            Intent:
            {' '}
            {[
              draft.deleteLink ? 'Link' : null,
              draft.deleteGeometry ? 'Geometry' : null,
              draft.deleteData ? 'Data' : null,
            ].filter(Boolean).join(' + ') || 'none'}
            <br />
            Basket:
            {' '}
            {draft.candidateLinkIds.length}
            {' '}
            link(s),
            {' '}
            {draft.candidateGeometryIds.length}
            {' '}
            geometry(ies),
            {' '}
            {draft.candidateDataIds.length}
            {' '}
            data
          </div>
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
          ) : null}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          disabled={!wizardActive || isCommitting}
          onClick={onBack}
        >
          Back
        </button>

        {isSetup ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!startEnabled}
            onClick={onStartDelete}
          >
            Start delete
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!confirmEnabled || isCommitting}
            onClick={onConfirmDelete}
            title="Confirm delete lands in M4"
          >
            Confirm delete
          </button>
        )}
      </div>
    </div>
  );
}
