import type { AnnotationDeletionDraft, AnnotationDeletionIntent } from './types';
import { canConfirmDeletionBasket } from './annotationDeletionBasket';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import DeletionFanOutConfirmModal from './DeletionFanOutConfirmModal';
import DeletionLinkResolutionModal from './DeletionLinkResolutionModal';
import DeletionCounterpartPickModal from './DeletionCounterpartPickModal';
import { useAnnotationDeletionWizard } from './useAnnotationDeletionWizard';

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
  const { allLinks, activeData, activeGeometries } = useAnnotationStore();
  const {
    isDeletionGeometryPickActive,
    confirmDeletionPendingAll,
    cancelDeletionPendingResolution,
    beginDeletionCounterpartPick,
    toggleDeletionCounterpartSelection,
    confirmDeletionCounterpartPick,
  } = useAnnotationDeletionWizard();

  const isSetup = draft.step === 'setup';
  const isSelecting = draft.step === 'selecting';
  const isCommitting = draft.step === 'committing';
  const wizardActive = isSelecting || isCommitting;
  const confirmEnabled = isSelecting
    && !isCommitting
    && canConfirmDeletionBasket(draft, { links: allLinks });

  const selectionHint = (() => {
    if (isDeletionGeometryPickActive) {
      return 'Select linked geometries in the viewer (Ctrl/Cmd+click to multi-select), then press OK.';
    }
    if (draft.deleteLink && !draft.deleteGeometry && !draft.deleteData) {
      return 'Link only: click a geometry or data row to identify the link (replaces previous). Ctrl/Cmd+click to add or remove. Multiple links open a resolution dialog.';
    }
    if (draft.deleteGeometry && !draft.deleteData) {
      return 'Select geometries in the viewer (replaces previous). Ctrl/Cmd+click to add or remove. Linked data is shown for context and is not selectable. Geometries with no links can still be selected. Multiple links ask for confirmation.';
    }
    if (draft.deleteData && !draft.deleteGeometry) {
      return 'Select data rows in the panel (replaces previous). Ctrl/Cmd+click to add or remove. Linked geometries are shown for context and are not selectable. Data with no links can still be selected. Multiple links ask for confirmation.';
    }
    return 'Select a geometry or data row (replaces previous). Ctrl/Cmd+click to add or remove. Multiple links open a resolution dialog.';
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

  const pending = draft.pendingResolution;
  const pendingEndpointLabel = (() => {
    if (!pending) {
      return '';
    }
    if (pending.endpointKind === 'geometry') {
      return activeGeometries.find((g) => g.id === pending.endpointId)?.id ?? pending.endpointId;
    }
    const datum = activeData.find((d) => d.id === pending.endpointId);
    return datum?.label?.trim() || datum?.id || pending.endpointId;
  })();

  const counterpartDataOptions = (() => {
    if (!pending || pending.modal !== 'pickCounterparts' || pending.endpointKind !== 'geometry') {
      return [];
    }
    const linkById = new Map([...allLinks].map((link) => [link.id, link]));
    const dataIds = new Set<string>();
    for (const linkId of pending.incidentLinkIds) {
      const link = linkById.get(linkId);
      if (link) {
        dataIds.add(link.dataId);
      }
    }
    return [...dataIds].map((id) => {
      const datum = activeData.find((d) => d.id === id);
      return { id, label: datum?.label?.trim() || id };
    });
  })();

  const pickSelectedCount = pending?.modal === 'pickCounterparts'
    ? pending.selectedCounterpartIds.length
    : 0;

  return (
    <div className="border rounded p-3 mb-3 bg-light-subtle">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {isCommitting
          ? 'Saving annotation deletion'
          : isDeletionGeometryPickActive
            ? 'Select geometries in the viewer'
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
            {isCommitting
              ? 'Deleting…'
              : isDeletionGeometryPickActive
                ? `Select geometries for ${pendingEndpointLabel}`
                : `Select items (${activeIntentLabel})`}
          </div>
          <p className="text-muted mb-2">{selectionHint}</p>
          {isDeletionGeometryPickActive ? (
            <p className="mb-0" aria-live="polite">
              {pickSelectedCount === 0
                ? 'No geometries selected yet.'
                : `${pickSelectedCount} geometr${pickSelectedCount === 1 ? 'y' : 'ies'} selected.`}
            </p>
          ) : (
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
          )}

          {draft.selectionMessage ? (
            <div className="alert alert-warning py-2 px-3 small mb-2 mt-2">{draft.selectionMessage}</div>
          ) : null}
          {setupError ? (
            <div className="alert alert-warning py-2 px-3 small mb-0 mt-2">{setupError}</div>
          ) : null}
        </div>
      )}

      {wizardActive ? (
        isDeletionGeometryPickActive ? (
          <div className="d-flex justify-content-end align-items-center mt-3 gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={cancelDeletionPendingResolution}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pickSelectedCount === 0}
              onClick={confirmDeletionCounterpartPick}
            >
              OK
            </button>
          </div>
        ) : (
          <div className="d-flex justify-content-between align-items-center mt-3 gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={isCommitting || Boolean(pending)}
              onClick={onBack}
              title={pending ? 'Resolve or cancel the multi-link dialog first' : undefined}
            >
              Back
            </button>

            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={!confirmEnabled || isCommitting}
              onClick={onConfirmDelete}
              title={confirmEnabled ? 'Confirm delete lands in M4' : 'Select a valid basket first'}
            >
              Confirm delete
            </button>
          </div>
        )
      ) : null}

      {pending?.modal === 'fanOut' ? (
        <DeletionFanOutConfirmModal
          endpointKind={pending.endpointKind}
          endpointLabel={pendingEndpointLabel}
          linkCount={pending.incidentLinkIds.length}
          onConfirm={confirmDeletionPendingAll}
          onCancel={cancelDeletionPendingResolution}
        />
      ) : null}

      {pending?.modal === 'linkResolution' ? (
        <DeletionLinkResolutionModal
          endpointKind={pending.endpointKind}
          endpointLabel={pendingEndpointLabel}
          linkCount={pending.incidentLinkIds.length}
          onAll={confirmDeletionPendingAll}
          onNone={cancelDeletionPendingResolution}
          onLetMeSelect={beginDeletionCounterpartPick}
        />
      ) : null}

      {pending?.modal === 'pickCounterparts' && pending.endpointKind === 'geometry' ? (
        <DeletionCounterpartPickModal
          endpointLabel={pendingEndpointLabel}
          options={counterpartDataOptions}
          selectedIds={pending.selectedCounterpartIds}
          onToggle={toggleDeletionCounterpartSelection}
          onConfirm={confirmDeletionCounterpartPick}
          onCancel={cancelDeletionPendingResolution}
        />
      ) : null}
    </div>
  );
}
