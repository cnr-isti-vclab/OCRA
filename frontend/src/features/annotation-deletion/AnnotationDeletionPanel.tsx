import { useMemo } from 'react';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import type { AnnotationDeletionDraft } from './types';
import {
  applyDeletionIntentAutoLink,
  canBeginDeletionWizard,
} from './annotationDeletionValidation';
import { canConfirmDeletionBasket } from './annotationDeletionBasket';

interface AnnotationDeletionPanelProps {
  draft: AnnotationDeletionDraft;
  setupError: string | null;
  onDraftChange: (patch: Partial<AnnotationDeletionDraft>) => void;
  onStartDelete: () => void;
  onBack: () => void;
  onConfirmDelete: () => void;
  onRemoveFromBasket: (args: {
    linkId?: string;
    geometryId?: string;
    dataId?: string;
  }) => void;
}

export default function AnnotationDeletionPanel({
  draft,
  setupError,
  onDraftChange,
  onStartDelete,
  onBack,
  onConfirmDelete,
  onRemoveFromBasket,
}: AnnotationDeletionPanelProps) {
  const { allLinks, allGeometries, allData } = useAnnotationStore();
  const isSetup = draft.step === 'setup';
  const isSelecting = draft.step === 'selecting';
  const isCommitting = draft.step === 'committing';
  const wizardActive = isSelecting || isCommitting;
  const startEnabled = isSetup && canBeginDeletionWizard(draft) && !isCommitting;
  const linkLocked = draft.deleteGeometry || draft.deleteData;
  const confirmEnabled = isSelecting
    && !isCommitting
    && canConfirmDeletionBasket(draft, { links: allLinks });

  const geometryLabels = useMemo(() => {
    const byId = new Map(allGeometries.map((geometry) => [geometry.id, geometry]));
    return draft.candidateGeometryIds.map((id) => ({
      id,
      label: byId.get(id)?.id ?? id,
    }));
  }, [allGeometries, draft.candidateGeometryIds]);

  const dataLabels = useMemo(() => {
    const byId = new Map(allData.map((datum) => [datum.id, datum]));
    return draft.candidateDataIds.map((id) => ({
      id,
      label: byId.get(id)?.label?.trim() || id,
    }));
  }, [allData, draft.candidateDataIds]);

  const linkLabels = useMemo(() => {
    const byId = new Map(allLinks.map((link) => [link.id, link]));
    const dataById = new Map(allData.map((datum) => [datum.id, datum]));
    return draft.candidateLinkIds.map((id) => {
      const link = byId.get(id);
      if (!link) {
        return { id, label: id };
      }
      const dataLabel = dataById.get(link.dataId)?.label?.trim() || link.dataId;
      return {
        id,
        label: `${link.geometryId.slice(0, 8)}… ↔ ${dataLabel}`,
      };
    });
  }, [allData, allLinks, draft.candidateLinkIds]);

  const patchIntent = (
    patch: Partial<Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>>,
  ) => {
    onDraftChange(applyDeletionIntentAutoLink(patch, draft));
  };

  const selectionHint = (() => {
    if (draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
      return 'Link only: select a geometry in the viewer or a data row in the panel. Items with one link are added; multiple links are not yet supported.';
    }
    if (draft.deleteGeometry && !draft.deleteData) {
      return 'Select geometries in the viewer (one link each).';
    }
    if (draft.deleteData && !draft.deleteGeometry) {
      return 'Select annotation data in the panel (one link each).';
    }
    return 'Select a geometry in the viewer or data in the panel (one link each).';
  })();

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
          <p className="text-muted mb-2">{selectionHint}</p>

          <div className="border rounded bg-white p-2 mb-2">
            <div className="fw-semibold mb-1">Basket</div>
            {linkLabels.length === 0 && geometryLabels.length === 0 && dataLabels.length === 0 ? (
              <div className="text-muted">Empty — select items above.</div>
            ) : (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
                {geometryLabels.map((item) => (
                  <li key={`g-${item.id}`} className="d-flex justify-content-between align-items-center gap-2">
                    <span>
                      <span className="badge text-bg-secondary me-1">Geo</span>
                      {item.label}
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0"
                      onClick={() => onRemoveFromBasket({ geometryId: item.id })}
                      aria-label={`Remove geometry ${item.label} from basket`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {dataLabels.map((item) => (
                  <li key={`d-${item.id}`} className="d-flex justify-content-between align-items-center gap-2">
                    <span>
                      <span className="badge text-bg-secondary me-1">Data</span>
                      {item.label}
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0"
                      onClick={() => onRemoveFromBasket({ dataId: item.id })}
                      aria-label={`Remove data ${item.label} from basket`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {linkLabels.map((item) => (
                  <li key={`l-${item.id}`} className="d-flex justify-content-between align-items-center gap-2">
                    <span>
                      <span className="badge text-bg-secondary me-1">Link</span>
                      {item.label}
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0"
                      onClick={() => onRemoveFromBasket({ linkId: item.id })}
                      aria-label={`Remove link ${item.label} from basket`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {draft.selectionMessage ? (
            <div className="alert alert-warning py-2 px-3 small mb-2">{draft.selectionMessage}</div>
          ) : null}
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mb-0">{setupError}</div>
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
            title={confirmEnabled ? 'Confirm delete lands in M4' : 'Select a valid 1:1 basket first'}
          >
            Confirm delete
          </button>
        )}
      </div>
    </div>
  );
}
