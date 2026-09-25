import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './annotation-workbench.css';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import AnnotationCreationDataStep from '../annotation-creation/AnnotationCreationDataStep';
import AnnotationCreationGeometryStep from '../annotation-creation/AnnotationCreationGeometryStep';
import AnnotationDataFormModal from '../annotation-creation/AnnotationDataFormModal';
import { AnnotationCreationActionBar } from '../annotation-creation/AnnotationCreationPanel';
import { useAnnotationCreationWizard } from '../annotation-creation/useAnnotationCreationWizard';
import { useCreationChosenEntityLocks } from '../annotation-creation/useCreationChosenEntityLocks';
import AnnotationDeletionPanel from '../annotation-deletion/AnnotationDeletionPanel';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';
import { buildAnnotationDisplayNumbers, orderByAnnotationDisplayNumber } from '../../utils/annotationDisplayNumbers';
import {
  canChangeCreationStepOrder,
  emptyPendingData,
  firstCreationStep,
  isGeometryFirst,
  isOnSecondCreationStep,
} from '../annotation-creation/annotationCreationValidation';
import type { AnnotationCreationStepOrder } from '../annotation-creation/types';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';
import { isDataIdUnderRemoteEditorLock } from '../../stores/annotation-social-locks';
import { isRecoverableRenderingMode } from '../../stores/annotation-rendering';
import { isGeometryIdUnderRemoteEditorLock } from '../annotation-deletion/isEntityBlockedForDeletion';

export type AnnotationWorkbenchMode = 'create' | 'delete';

interface AnnotationWorkbenchProps {
  isOpen: boolean;
  isDetached: boolean;
  onDetachedChange: (isDetached: boolean) => void;
  mode: AnnotationWorkbenchMode;
  sceneId: string;
  sceneLabel?: string;
  sceneAssets?: Array<{ id: string; label: string }>;
  /**
   * Shape tools that are visible but not wired yet (e.g. line/area on 3D).
   * Edit stays hidden in the workbench toolbar for both viewers.
   */
  disabledGeometryToolbarModes?: ReadonlyArray<'point' | 'line' | 'area' | 'edit'>;
  onClose: () => void;
}

interface FloatingWorkbenchPosition {
  left: number;
  top: number;
}

/**
 * Non-modal authoring surface for create and unlink/delete.
 * It deliberately leaves the viewer interactive while a draft is in progress.
 *
 * Scopes stay on scene defaults (see createDefaultCreationDraft) until we need
 * an asset/project scope picker again — do not reintroduce them casually.
 */
export default function AnnotationWorkbench({
  isOpen,
  isDetached,
  onDetachedChange,
  mode,
  disabledGeometryToolbarModes = [],
  onClose,
}: AnnotationWorkbenchProps) {
  const {
    creationDraft,
    creating,
    allGeometries,
    allData,
    allLinks,
    activeSocialLocks,
    currentStreamId,
    activeAnnotationSelection,
    primaryAnnotationSelection,
    initCreationDraft,
    updateCreationDraft,
    beginCreationWizard,
    advanceCreationStep,
    discardCreationDraft,
    undoLastCreatedGeometry,
    confirmPendingCreatedData,
    undoLastCreatedData,
    deletionDraft,
    deleting,
    initDeletionDraft,
    discardDeletionDraft,
    beginDeletionWizard,
    beginDeletionForTarget,
    commitDeletionDraft,
    clearFocus,
    vocabularySchemes,
    vocabularyConcepts,
    vocabularyProperties,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();
  const { isCreationDataStep, isCreationGeometryStep, isCreationGeometrySearch, searchableData, searchableGeometries, setCreationGeometrySelection, toggleCreationDataSelection } =
    useAnnotationCreationWizard();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [deletionSetupError, setDeletionSetupError] = useState<string | null>(null);
  const [geometrySearchQuery, setGeometrySearchQuery] = useState('');
  const [dataEditorOpen, setDataEditorOpen] = useState(false);
  const [discardModal, setDiscardModal] = useState<MessageModalDescriptor | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
  const [floatingPosition, setFloatingPosition] = useState<FloatingWorkbenchPosition | null>(null);
  const hadCreationDraftRef = useRef(false);
  const wasOpenRef = useRef(false);
  const lastModeRef = useRef(mode);
  const geometryNumbers = useMemo(() => buildAnnotationDisplayNumbers(allGeometries), [allGeometries]);
  const dataNumbers = useMemo(() => buildAnnotationDisplayNumbers(allData), [allData]);
  const linkedGeometryIds = useMemo(() => new Set(
    allLinks.filter((link) => link.erasableAt === null).map((link) => link.geometryId),
  ), [allLinks]);
  const isCreateMode = mode === 'create';
  const isDeleteMode = mode === 'delete';

  useCreationChosenEntityLocks(creationDraft, isOpen && isCreateMode, startEditorLock, stopEditorLock);

  const isDataBlockedForLinking = useCallback((dataId: string) => (
    isDataIdUnderRemoteEditorLock(
      dataId,
      activeSocialLocks,
      currentStreamId,
      activeAnnotationSelection.geometryIdsByDataId,
      allLinks,
    )
  ), [activeAnnotationSelection.geometryIdsByDataId, activeSocialLocks, allLinks, currentStreamId]);

  const isGeometryBlockedForLinking = useCallback((geometryId: string) => (
    isGeometryIdUnderRemoteEditorLock(
      geometryId,
      activeSocialLocks,
      currentStreamId,
      allLinks,
    )
  ), [activeSocialLocks, allLinks, currentStreamId]);

  const geometryLabelsById = useMemo(() => {
    const dataById = new Map(allData.map((datum) => [datum.id, datum]));
    const labelsByGeometryId = new Map<string, string[]>();
    for (const link of allLinks) {
      if (link.erasableAt !== null) {
        continue;
      }
      const datum = dataById.get(link.dataId);
      const label = datum?.erasableAt === null ? datum.label.trim() : '';
      if (!label) {
        continue;
      }
      const labels = labelsByGeometryId.get(link.geometryId) ?? [];
      if (!labels.includes(label)) {
        labels.push(label);
      }
      labelsByGeometryId.set(link.geometryId, labels);
    }
    return labelsByGeometryId;
  }, [allData, allLinks]);

  const filteredSearchableGeometries = useMemo(() => {
    const ordered = orderByAnnotationDisplayNumber(searchableGeometries, geometryNumbers);
    const query = geometrySearchQuery.trim().toLocaleLowerCase();
    if (!query) {
      return ordered;
    }
    return ordered.filter((geometry) => {
      const labels = geometryLabelsById.get(geometry.id) ?? [];
      const searchableText = labels.length > 0
        ? labels.join(' ')
        : 'Unlabelled geometry';
      return searchableText.toLocaleLowerCase().includes(query);
    });
  }, [geometryLabelsById, geometryNumbers, geometrySearchQuery, searchableGeometries]);

  const seedDeletionDraft = useCallback(() => {
    if (deletionDraft) {
      return;
    }
    if (primaryAnnotationSelection) {
      const renderingMode = primaryAnnotationSelection.kind === 'geometry'
        ? activeAnnotationSelection.renderingModeByGeometryId.get(primaryAnnotationSelection.id)
        : activeAnnotationSelection.renderingModeByDataId.get(primaryAnnotationSelection.id);
      if (isRecoverableRenderingMode(renderingMode)) {
        initDeletionDraft();
        setDeletionSetupError('Erased annotations can only be restored, not deleted again.');
        return;
      }
      const result = beginDeletionForTarget(primaryAnnotationSelection);
      setDeletionSetupError(result.ok ? null : result.message);
      return;
    }
    initDeletionDraft();
    setDeletionSetupError(null);
  }, [
    activeAnnotationSelection.renderingModeByDataId,
    activeAnnotationSelection.renderingModeByGeometryId,
    beginDeletionForTarget,
    deletionDraft,
    initDeletionDraft,
    primaryAnnotationSelection,
  ]);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    const modeChangedWhileOpen = isOpen && wasOpenRef.current && lastModeRef.current !== mode;
    wasOpenRef.current = isOpen;
    lastModeRef.current = mode;

    if (!isOpen || (!justOpened && !modeChangedWhileOpen)) {
      return;
    }

    setSetupError(null);
    setDeletionSetupError(null);

    if (isCreateMode) {
      if (deletionDraft) {
        discardDeletionDraft();
      }
      if (!creationDraft) {
        initCreationDraft();
        const result = beginCreationWizard();
        if (!result.ok) {
          setSetupError(result.message);
        }
      }
      // 3D is point-only for now; keep draft drawing mode on point when line/area are disabled.
      if (disabledGeometryToolbarModes.includes('line') || disabledGeometryToolbarModes.includes('area')) {
        updateCreationDraft({ drawingMode: 'point' });
      }
      return;
    }

    if (creationDraft) {
      discardCreationDraft();
    }
    seedDeletionDraft();
  }, [
    beginCreationWizard,
    creationDraft,
    deletionDraft,
    discardCreationDraft,
    discardDeletionDraft,
    disabledGeometryToolbarModes,
    initCreationDraft,
    isCreateMode,
    isOpen,
    mode,
    seedDeletionDraft,
    updateCreationDraft,
  ]);

  useEffect(() => {
    if (!isOpen || !isCreateMode) {
      hadCreationDraftRef.current = false;
      return;
    }
    if (creationDraft) {
      hadCreationDraftRef.current = true;
      return;
    }
    if (hadCreationDraftRef.current) {
      hadCreationDraftRef.current = false;
      onClose();
    }
  }, [creationDraft, isCreateMode, isOpen, onClose]);

  useEffect(() => {
    if (!isCreationDataStep) {
      setDataEditorOpen(false);
    }
  }, [isCreationDataStep]);

  const requestClose = useCallback(() => {
    if (creating || deleting) {
      return;
    }
    if (isCreateMode && creationDraft) {
      setDiscardModal(new MessageModalDescriptor({
        tone: 'warning',
        title: 'Discard annotation draft?',
        message: 'Your current Geometry, Data, and Link choices will be discarded.',
        actions: [
          { key: 'keep', label: 'Keep editing', tone: 'secondary' },
          { key: 'discard', label: 'Discard', tone: 'danger' },
        ],
        dismissOnBackdrop: false,
      }));
      return;
    }
    if (isDeleteMode && deletionDraft) {
      setDiscardModal(new MessageModalDescriptor({
        tone: 'warning',
        title: 'Cancel unlink/delete operation?',
        message: 'This will discard the current choices and clear the selection.',
        actions: [
          { key: 'keep', label: 'Keep editing', tone: 'secondary' },
          { key: 'discard', label: 'Discard', tone: 'danger' },
        ],
        dismissOnBackdrop: false,
      }));
      return;
    }
    onClose();
  }, [creating, creationDraft, deleting, deletionDraft, isCreateMode, isDeleteMode, onClose]);

  const discardAndClose = useCallback(() => {
    if (isCreateMode) {
      discardCreationDraft();
    }
    if (isDeleteMode) {
      discardDeletionDraft();
    }
    setSetupError(null);
    setDeletionSetupError(null);
    setDiscardModal(null);
    onClose();
  }, [discardCreationDraft, discardDeletionDraft, isCreateMode, isDeleteMode, onClose]);

  const next = useCallback(async () => {
    const result = await advanceCreationStep();
    if (!result.ok) {
      setSetupError(result.message);
    }
  }, [advanceCreationStep]);

  const back = useCallback(() => {
    if (creationDraft && isOnSecondCreationStep(creationDraft)) {
      updateCreationDraft({ step: firstCreationStep(creationDraft.stepOrder) });
      setSetupError(null);
      return;
    }
    requestClose();
  }, [creationDraft, requestClose, updateCreationDraft]);

  const handleStepOrderChange = useCallback((stepOrder: AnnotationCreationStepOrder) => {
    if (!creationDraft || !canChangeCreationStepOrder(creationDraft)) {
      return;
    }
    updateCreationDraft({
      stepOrder,
      step: firstCreationStep(stepOrder),
      geometryMode: stepOrder === 'geometry-first' ? 'new' : null,
      dataMode: stepOrder === 'data-first' ? 'new' : null,
    });
    setSetupError(null);
  }, [creationDraft, updateCreationDraft]);

  const handleBeginDeletion = useCallback((intent: {
    deleteLink: boolean;
    deleteGeometry: boolean;
    deleteData: boolean;
  }) => {
    const result = beginDeletionWizard(intent);
    if (!result.ok) {
      setDeletionSetupError(result.message);
      return;
    }
    setDeletionSetupError(null);
  }, [beginDeletionWizard]);

  const handleConfirmDeletion = useCallback(() => {
    void (async () => {
      setDeletionSetupError(null);
      const result = await commitDeletionDraft();
      if (!result.ok) {
        setDeletionSetupError(result.message);
        return;
      }
      clearFocus();
      if (result.message) {
        setMessageModal(new MessageModalDescriptor({
          tone: 'success',
          title: 'Changes saved',
          message: result.message,
        }));
        return;
      }
      onClose();
    })();
  }, [clearFocus, commitDeletionDraft, onClose]);

  const startDetachedDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!isDetached || (event.target instanceof Element && event.target.closest('button'))) {
      return;
    }
    const workbench = event.currentTarget.parentElement;
    if (!workbench) {
      return;
    }
    const bounds = workbench.getBoundingClientRect();
    const pointerOffsetX = event.clientX - bounds.left;
    const pointerOffsetY = event.clientY - bounds.top;
    // Keep a narrow portion of the title bar reachable while allowing the
    // workbench to be deliberately parked beyond the viewport edges.
    const visibleGripSize = 72;

    const move = (moveEvent: PointerEvent) => {
      setFloatingPosition({
        left: Math.max(
          visibleGripSize - bounds.width,
          Math.min(moveEvent.clientX - pointerOffsetX, window.innerWidth - visibleGripSize),
        ),
        top: Math.max(
          0,
          Math.min(moveEvent.clientY - pointerOffsetY, window.innerHeight - visibleGripSize),
        ),
      });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  }, [isDetached]);

  if (!isOpen) {
    return null;
  }

  const step = creationDraft?.step ?? 'geometry';

  return (
    <aside
      className={[
        'annotation-workbench bg-white border-start shadow d-flex flex-column',
        isDetached ? 'is-detached' : '',
        isDeleteMode ? 'is-authoring-delete' : '',
      ].filter(Boolean).join(' ')}
      aria-label={isDeleteMode ? 'Unlink and delete workbench' : 'Annotation workbench'}
      style={isDetached && floatingPosition
        ? { left: floatingPosition.left, top: floatingPosition.top, right: 'auto' }
        : undefined}
    >
      <header
        className={`annotation-workbench__header d-flex align-items-start justify-content-between gap-3 p-3 border-bottom ${isDetached ? 'is-draggable' : ''}`}
        onPointerDown={startDetachedDrag}
      >
        <div>
          <div className="d-flex align-items-center gap-2">
            <i className={`bi ${isDeleteMode ? 'bi-trash text-danger' : 'bi-vector-pen text-primary'}`} aria-hidden />
            <h2 className="h5 mb-0">{isDeleteMode ? 'Unlink / Delete' : 'Annotation workbench'}</h2>
          </div>
          <p className="small text-muted mb-0 mt-1">
            {isDeleteMode
              ? 'Choose what to unlink or mark as erasable.'
              : 'Compose geometry, data, and their relationship.'}
          </p>
        </div>
        <div className="d-flex gap-1 flex-shrink-0">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-pressed={isDetached}
            aria-label={isDetached ? 'Dock annotation workbench' : 'Detach annotation workbench'}
            title={isDetached ? 'Dock to viewer edge' : 'Detach as a floating panel'}
            onClick={() => {
              onDetachedChange(!isDetached);
              setFloatingPosition(null);
            }}
          >
            <i className={`bi ${isDetached ? 'bi-layout-sidebar-inset' : 'bi-arrows-angle-expand'}`} aria-hidden />
          </button>
          <button type="button" className="btn-close" aria-label="Close annotation workbench" onClick={requestClose} />
        </div>
      </header>

      {isCreateMode ? (
        <>
          <div className="px-3 pt-3">
            {creationDraft ? (
              <div className="btn-group w-100 mb-2" role="group" aria-label="Creation step order">
                <button
                  type="button"
                  className={`btn btn-sm ${creationDraft.stepOrder === 'geometry-first' ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={creationDraft.stepOrder === 'geometry-first'}
                  disabled={!canChangeCreationStepOrder(creationDraft) || creating}
                  title={
                    !canChangeCreationStepOrder(creationDraft)
                      ? 'Clear drafts before changing order'
                      : undefined
                  }
                  onClick={() => handleStepOrderChange('geometry-first')}
                >
                  Geometry first
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${creationDraft.stepOrder === 'data-first' ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={creationDraft.stepOrder === 'data-first'}
                  disabled={!canChangeCreationStepOrder(creationDraft) || creating}
                  title={
                    !canChangeCreationStepOrder(creationDraft)
                      ? 'Clear drafts before changing order'
                      : undefined
                  }
                  onClick={() => handleStepOrderChange('data-first')}
                >
                  Data first
                </button>
              </div>
            ) : null}
          </div>

          <ol className="annotation-workbench__steps list-unstyled d-flex mb-0 px-3 pt-2 gap-1" aria-label="Creation progress">
            {(creationDraft && !isGeometryFirst(creationDraft)
              ? [['data', 'Data'], ['geometry', 'Geometry']] as const
              : [['geometry', 'Geometry'], ['data', 'Data']] as const
            ).map(([key, label], index) => {
              const ordered = creationDraft && !isGeometryFirst(creationDraft)
                ? (['data', 'geometry'] as const)
                : (['geometry', 'data'] as const);
              const secondKey = ordered[1];
              const active = step === key || (step === 'committing' && key === secondKey);
              const complete = key === ordered[0] && (step === secondKey || step === 'committing');
              return (
                <li key={key} className={`annotation-workbench__step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}>
                  <span>{complete ? '✓' : index + 1}</span>{label}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      <div className="annotation-workbench__body flex-grow-1 overflow-auto p-3">
        {isDeleteMode && deletionDraft ? (
          <AnnotationDeletionPanel
            draft={deletionDraft}
            setupError={deletionSetupError}
            confirming={deleting}
            onStartDelete={handleBeginDeletion}
            onBack={requestClose}
            onConfirmDelete={handleConfirmDeletion}
          />
        ) : null}

        {isCreateMode && isCreationGeometryStep && creationDraft ? (
          <section aria-labelledby="annotation-geometry-step-title">
            <AnnotationCreationGeometryStep
              draft={creationDraft}
              creating={creating}
              disabledToolbarModes={disabledGeometryToolbarModes}
              onGeometryModeChange={(geometryMode) => updateCreationDraft({
                geometryMode,
                selectedGeometryIds: geometryMode === 'choose' ? creationDraft.selectedGeometryIds : [],
                createdGeometries: geometryMode === 'choose' ? [] : creationDraft.createdGeometries,
              })}
              onDrawingModeChange={(drawingMode) => updateCreationDraft({ drawingMode })}
              onUndoLastCreatedGeometry={() => {
                undoLastCreatedGeometry();
              }}
              onDone={() => void next()}
            />
          </section>
        ) : null}

        {isCreateMode && isCreationGeometrySearch && creationDraft ? (
          <section className="mt-3" aria-label="Existing geometries">
            <div className="fw-semibold small mb-2">Choose existing geometry</div>
            <input
              type="search"
              className="form-control form-control-sm mb-2"
              placeholder="Search geometry labels..."
              value={geometrySearchQuery}
              onChange={(event) => setGeometrySearchQuery(event.target.value)}
              aria-label="Search existing geometries by label"
            />
            <div className="list-group">
              {filteredSearchableGeometries.length === 0 ? (
                <div className="text-muted small fst-italic">No geometry matches the current search and filters.</div>
              ) : null}
              {filteredSearchableGeometries.map((geometry) => {
                const selected = creationDraft.selectedGeometryIds.includes(geometry.id);
                const blocked = !selected && isGeometryBlockedForLinking(geometry.id);
                const displayNumber = geometryNumbers.get(geometry.id);
                const labels = geometryLabelsById.get(geometry.id) ?? [];
                const displayLabel = labels.length === 0
                  ? 'Unlabelled geometry'
                  : labels.length === 1
                    ? labels[0]
                    : `${labels[0]} ...`;
                return (
                  <button
                    key={geometry.id}
                    type="button"
                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between ${selected ? 'active' : ''}${blocked ? ' disabled' : ''}`}
                    disabled={blocked}
                    title={blocked ? 'Another user is editing this geometry' : undefined}
                    onClick={() => {
                      if (blocked) {
                        setSetupError('Another user is editing this geometry.');
                        return;
                      }
                      setCreationGeometrySelection(
                        selected
                          ? creationDraft.selectedGeometryIds.filter((id) => id !== geometry.id)
                          : [...creationDraft.selectedGeometryIds, geometry.id],
                      );
                    }}
                  >
                    <span className="annotation-index-column me-2">
                      {displayNumber !== undefined ? (
                        <AnnotationIndexBadge kind="geometry" number={displayNumber} />
                      ) : null}
                    </span>
                    <span className="text-truncate" title={labels.join(', ') || 'Unlabelled geometry'}>{displayLabel}</span>
                    {blocked ? <span className="badge text-bg-warning border ms-2 flex-shrink-0">In use</span> : null}
                    {!linkedGeometryIds.has(geometry.id) ? <span className="badge text-bg-light border ms-2 flex-shrink-0">Available · no links</span> : null}
                    <span className="small ms-2 flex-shrink-0">{geometry.shapes.length} shape{geometry.shapes.length === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {isCreateMode && setupError ? <div className="alert alert-warning small mt-3 mb-0">{setupError}</div> : null}

        {isCreateMode && isCreationDataStep && creationDraft ? (
          <section className="mt-3" aria-label="Annotation data">
            <AnnotationCreationDataStep
              draft={creationDraft}
              candidates={searchableData}
              displayNumbersById={dataNumbers}
              creating={creating}
              isCandidateBlocked={isDataBlockedForLinking}
              onBlockedSelect={() => {
                setSetupError('Another user is editing this annotation data.');
              }}
              onToggleDataSelection={toggleCreationDataSelection}
              onOpenCreateModal={() => {
                updateCreationDraft({ dataMode: 'new', ...emptyPendingData() });
                setDataEditorOpen(true);
                setSetupError(null);
              }}
              onDataModeChange={(dataMode) => updateCreationDraft({
                dataMode,
                selectedDataIds: dataMode === 'choose' ? creationDraft.selectedDataIds : [],
                createdData: dataMode === 'choose' ? [] : creationDraft.createdData,
                ...(dataMode === 'new' ? {} : emptyPendingData()),
              })}
              onUndoLastCreatedData={() => {
                undoLastCreatedData();
              }}
              onDone={() => void next()}
            />
          </section>
        ) : null}
      </div>

      {isCreateMode ? (
        <footer className="annotation-workbench__footer border-top p-3 bg-light-subtle small">
          {creationDraft ? (
            <AnnotationCreationActionBar
              draft={creationDraft}
              creating={creating}
              onCreate={() => {}}
              onBack={back}
              onNext={() => void next()}
              onCancel={requestClose}
              nextButtonClassName="annotation-workbench__primary-action"
            />
          ) : null}
        </footer>
      ) : null}

      {dataEditorOpen && creationDraft ? (
        <AnnotationDataFormModal
          title="Create annotation data"
          saveLabel="Add data"
          values={{
            label: creationDraft.pendingDataLabel,
            description: creationDraft.pendingDataDescription,
            annotationClass: creationDraft.pendingDataClass,
          }}
          saveDisabled={creationDraft.pendingDataLabel.trim().length === 0}
          onChange={(patch) => updateCreationDraft({
            ...(patch.label !== undefined ? { pendingDataLabel: patch.label } : {}),
            ...(patch.description !== undefined ? { pendingDataDescription: patch.description } : {}),
            ...(patch.annotationClass !== undefined ? { pendingDataClass: patch.annotationClass } : {}),
          })}
          onSave={() => {
            const result = confirmPendingCreatedData();
            if (!result.ok) {
              setSetupError(result.message);
              return;
            }
            setSetupError(null);
            setDataEditorOpen(false);
          }}
          onCancel={() => {
            updateCreationDraft({
              ...emptyPendingData(),
              ...(creationDraft.createdData.length === 0 ? { dataMode: null } : {}),
            });
            setDataEditorOpen(false);
          }}
          vocabularySchemes={vocabularySchemes}
          vocabularyConcepts={vocabularyConcepts}
          vocabularyProperties={vocabularyProperties}
        />
      ) : null}
      <AppMessageModal
        descriptor={discardModal}
        onClose={() => setDiscardModal(null)}
        onAction={(actionKey) => {
          if (actionKey === 'discard') {
            discardAndClose();
            return;
          }
          setDiscardModal(null);
        }}
      />
      <AppMessageModal
        descriptor={messageModal}
        onClose={() => {
          setMessageModal(null);
          onClose();
        }}
      />
    </aside>
  );
}
