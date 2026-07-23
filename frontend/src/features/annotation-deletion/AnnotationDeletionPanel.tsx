import type { AnnotationDeletionDraft, AnnotationDeletionIntent } from './types';
import { canConfirmDeletionBasket } from './annotationDeletionBasket';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';

const INTENT_PRESETS: Array<{
  id: string;
  label: string;
  intent: AnnotationDeletionIntent;
}> = [
  {
    id: 'link',
    label: 'Link',
    intent: { deleteLink: true, deleteGeometry: false, deleteData: false },
  },
  {
    id: 'link-geo-data',
    label: 'Link+Geo+Data',
    intent: { deleteLink: true, deleteGeometry: true, deleteData: true },
  },
  {
    id: 'link-geo',
    label: 'Link+Geo',
    intent: { deleteLink: true, deleteGeometry: true, deleteData: false },
  },
  {
    id: 'link-data',
    label: 'Link+Data',
    intent: { deleteLink: true, deleteGeometry: false, deleteData: true },
  },
];

interface AnnotationDeletionPanelProps {
  draft: AnnotationDeletionDraft;
  setupError: string | null;
  onStartDelete: (intent: AnnotationDeletionIntent) => void;
  onBack: () => void;
  onConfirmDelete: () => void;
}

export default function AnnotationDeletionPanel({
  draft,
  setupError,
  onStartDelete,
  onBack,
  onConfirmDelete,
}: AnnotationDeletionPanelProps) {
  const { allLinks } = useAnnotationStore();
  const isSetup = draft.step === 'setup';
  const isSelecting = draft.step === 'selecting';
  const isCommitting = draft.step === 'committing';
  const wizardActive = isSelecting || isCommitting;
  const confirmEnabled = isSelecting
    && !isCommitting
    && canConfirmDeletionBasket(draft, { links: allLinks });

  const selectionHint = (() => {
    if (draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
      return 'Link only: click a geometry or data row to identify the link (replaces previous). Ctrl/Cmd+click to add or remove. One link each for now; multiple links are not yet supported.';
    }
    if (draft.deleteGeometry && !draft.deleteData) {
      return 'Select geometries in the viewer (replaces previous). Ctrl/Cmd+click to add or remove. Linked data is shown for context and is not selectable. One link each for now.';
    }
    if (draft.deleteData && !draft.deleteGeometry) {
      return 'Select data rows in the panel (replaces previous). Ctrl/Cmd+click to add or remove. Linked geometries are shown for context and are not selectable. One link each for now.';
    }
    return 'Select a geometry or data row (replaces previous). Ctrl/Cmd+click to add or remove. One link each for now.';
  })();

  const activeIntentLabel = INTENT_PRESETS.find((preset) => (
    preset.intent.deleteLink === draft.deleteLink
    && preset.intent.deleteGeometry === draft.deleteGeometry
    && preset.intent.deleteData === draft.deleteData
  ))?.label ?? 'Custom';

  const geometryCount = draft.candidateGeometryIds.length;
  const dataCount = draft.candidateDataIds.length;
  const linkCount = draft.candidateLinkIds.length;
  const basketEmpty = geometryCount === 0 && dataCount === 0 && linkCount === 0;

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
          <div
            className="d-grid gap-2"
            style={{ gridTemplateColumns: '1fr 1fr' }}
            role="group"
            aria-label="Deletion intent"
          >
            {INTENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn btn-outline-danger btn-sm"
                disabled={isCommitting}
                onClick={() => onStartDelete(preset.intent)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mt-2 mb-0">{setupError}</div>
          ) : null}
        </>
      ) : (
        <div className="small">
          <div className="fw-semibold mb-1">
            {isCommitting ? 'Deleting…' : `Select items (${activeIntentLabel})`}
          </div>
          <p className="text-muted mb-2">{selectionHint}</p>
          <p className="text-muted mb-2 mb-0" aria-live="polite">
            {basketEmpty
              ? 'Nothing selected yet.'
              : (
                <>
                  Selected:
                  {' '}
                  {geometryCount}
                  {' '}
                  geometr
                  {geometryCount === 1 ? 'y' : 'ies'}
                  ,
                  {' '}
                  {dataCount}
                  {' '}
                  data
                  ,
                  {' '}
                  {linkCount}
                  {' '}
                  link
                  {linkCount === 1 ? '' : 's'}
                  .
                </>
              )}
          </p>

          {/* Basket list temporarily hidden — labels/cascade UX TBD.
          <div className="border rounded bg-white p-2 mb-2">
            ...
          </div>
          */}

          {draft.selectionMessage ? (
            <div className="alert alert-warning py-2 px-3 small mb-2 mt-2">{draft.selectionMessage}</div>
          ) : null}
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mb-0 mt-2">{setupError}</div>
          ) : null}
        </div>
      )}

      {wizardActive ? (
        <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={isCommitting}
            onClick={onBack}
          >
            Back
          </button>

          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!confirmEnabled || isCommitting}
            onClick={onConfirmDelete}
            title={confirmEnabled ? 'Confirm delete lands in M4' : 'Select a valid 1:1 basket first'}
          >
            Confirm delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
