import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AnnotationEventResourceType } from 'shared/annotation-events';
import './annotation-workbench.css';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import AnnotationCreationDataStep from '../annotation-creation/AnnotationCreationDataStep';
import AnnotationDataFormModal from '../annotation-creation/AnnotationDataFormModal';
import { AnnotationCreationActionBar } from '../annotation-creation/AnnotationCreationPanel';
import { useAnnotationCreationWizard } from '../annotation-creation/useAnnotationCreationWizard';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';
import { buildAnnotationDisplayNumbers, orderByAnnotationDisplayNumber } from '../../utils/annotationDisplayNumbers';
import { normalizeMultiSideForChoices } from '../annotation-creation/annotationCreationValidation';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';

interface AnnotationWorkbenchProps {
  isOpen: boolean;
  sceneId: string;
  sceneLabel?: string;
  sceneAssets?: Array<{ id: string; label: string }>;
  onClose: () => void;
}

interface FloatingWorkbenchPosition {
  left: number;
  top: number;
}

interface WorkbenchEditorLock {
  resourceType: AnnotationEventResourceType;
  resourceId: string;
  activity: string;
}

/**
 * Non-modal authoring surface for Geometry, Data, and Link creation.
 * It deliberately leaves the viewer interactive while a draft is in progress.
 */
export default function AnnotationWorkbench({
  isOpen,
  onClose,
}: AnnotationWorkbenchProps) {
  const {
    creationDraft,
    creating,
    allGeometries,
    allData,
    allLinks,
    initCreationDraft,
    updateCreationDraft,
    beginCreationWizard,
    advanceCreationStep,
    discardCreationDraft,
    vocabularySchemes,
    vocabularyConcepts,
    vocabularyProperties,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();
  const { isCreationDataStep, isCreationGeometryStep, isCreationGeometrySearch, searchableData, searchableGeometries, setCreationGeometrySelection, toggleCreationDataSelection } =
    useAnnotationCreationWizard();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [geometrySearchQuery, setGeometrySearchQuery] = useState('');
  const [dataEditorOpen, setDataEditorOpen] = useState(false);
  const [discardModal, setDiscardModal] = useState<MessageModalDescriptor | null>(null);
  const [isDetached, setIsDetached] = useState(true);
  const [floatingPosition, setFloatingPosition] = useState<FloatingWorkbenchPosition | null>(null);
  const hadCreationDraftRef = useRef(false);
  const wasOpenRef = useRef(false);
  const selectedExistingLocksRef = useRef(new Map<string, WorkbenchEditorLock>());
  const geometryNumbers = useMemo(() => buildAnnotationDisplayNumbers(allGeometries), [allGeometries]);
  const dataNumbers = useMemo(() => buildAnnotationDisplayNumbers(allData), [allData]);
  const linkedGeometryIds = useMemo(() => new Set(
    allLinks.filter((link) => link.erasableAt === null).map((link) => link.geometryId),
  ), [allLinks]);
  const selectedExistingDataLocks = useMemo<WorkbenchEditorLock[]>(() => {
    if (!isOpen || !creationDraft) {
      return [];
    }
    return [
      ...(creationDraft.dataChoice === 'search'
        ? creationDraft.selectedDataIds.map((resourceId) => ({
          resourceType: 'data' as const,
          resourceId,
          activity: 'linking existing annotation data',
        }))
        : []),
    ];
  }, [creationDraft, isOpen]);

  useEffect(() => {
    const next = new Map(
      selectedExistingDataLocks.map((lock) => [`${lock.resourceType}:${lock.resourceId}`, lock]),
    );
    const previous = selectedExistingLocksRef.current;
    const toStart = [...next].filter(([key]) => !previous.has(key)).map(([, lock]) => lock);
    const toStop = [...previous].filter(([key]) => !next.has(key)).map(([, lock]) => lock);
    selectedExistingLocksRef.current = next;

    void Promise.all([
      ...toStart.map((lock) => startEditorLock(lock.resourceType, lock.resourceId, lock.activity)),
      ...toStop.map((lock) => stopEditorLock(lock.resourceType, lock.resourceId, lock.activity)),
    ]).catch((error: unknown) => {
      console.warn('Failed to synchronize annotation workbench locks:', error);
    });
  }, [selectedExistingDataLocks, startEditorLock, stopEditorLock]);

  useEffect(() => () => {
    const locks = [...selectedExistingLocksRef.current.values()];
    selectedExistingLocksRef.current.clear();
    void Promise.all(locks.map((lock) => stopEditorLock(lock.resourceType, lock.resourceId, lock.activity)))
      .catch((error: unknown) => {
        console.warn('Failed to release annotation workbench locks:', error);
      });
  }, [stopEditorLock]);

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

  useEffect(() => {
    if (isOpen && !wasOpenRef.current && !creationDraft) {
      initCreationDraft();
      updateCreationDraft({ geometryChoice: 'new', dataChoice: 'void', multiSide: null });
      const result = beginCreationWizard();
      if (!result.ok) {
        setSetupError(result.message);
      }
    }
    wasOpenRef.current = isOpen;
  }, [beginCreationWizard, creationDraft, initCreationDraft, isOpen, updateCreationDraft]);

  useEffect(() => {
    if (!isOpen) {
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
  }, [creationDraft, isOpen, onClose]);

  useEffect(() => {
    if (!isCreationDataStep) {
      setDataEditorOpen(false);
    }
  }, [isCreationDataStep]);

  const requestClose = useCallback(() => {
    if (creating) {
      return;
    }
    if (creationDraft) {
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
    onClose();
  }, [creating, creationDraft, onClose]);

  const discardAndClose = useCallback(() => {
    discardCreationDraft();
    setSetupError(null);
    setDiscardModal(null);
    onClose();
  }, [discardCreationDraft, onClose]);

  const begin = useCallback(() => {
    const result = beginCreationWizard();
    setSetupError(result.ok ? null : result.message);
  }, [beginCreationWizard]);

  const next = useCallback(async () => {
    const result = await advanceCreationStep();
    if (!result.ok) {
      setSetupError(result.message);
    }
  }, [advanceCreationStep]);

  const finishGeometryOnly = useCallback(async () => {
    updateCreationDraft({
      dataChoice: 'void',
      selectedDataIds: [],
      multiSide: null,
    });
    const dataStepResult = await advanceCreationStep();
    if (!dataStepResult.ok) {
      setSetupError(dataStepResult.message);
      return;
    }
    const commitResult = await advanceCreationStep();
    if (!commitResult.ok) {
      setSetupError(commitResult.message);
    }
  }, [advanceCreationStep, updateCreationDraft]);

  const back = useCallback(() => {
    if (creationDraft?.step === 'data') {
      updateCreationDraft({
        step: 'geometry',
        geometryChoice: creationDraft.geometryChoice === 'void' ? 'new' : creationDraft.geometryChoice,
      });
      setSetupError(null);
      return;
    }
    requestClose();
  }, [creationDraft, requestClose, updateCreationDraft]);

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
      className={`annotation-workbench bg-white border-start shadow d-flex flex-column ${isDetached ? 'is-detached' : ''}`}
      aria-label="Annotation workbench"
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
            <i className="bi bi-vector-pen text-primary" aria-hidden />
            <h2 className="h5 mb-0">Annotation workbench</h2>
          </div>
          <p className="small text-muted mb-0 mt-1">Compose geometry, data, and their relationship.</p>
        </div>
        <div className="d-flex gap-1 flex-shrink-0">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            aria-pressed={isDetached}
            aria-label={isDetached ? 'Dock annotation workbench' : 'Detach annotation workbench'}
            title={isDetached ? 'Dock to viewer edge' : 'Detach as a floating panel'}
            onClick={() => {
              setIsDetached((detached) => !detached);
              setFloatingPosition(null);
            }}
          >
            <i className={`bi ${isDetached ? 'bi-layout-sidebar-inset' : 'bi-arrows-angle-expand'}`} aria-hidden />
          </button>
          <button type="button" className="btn-close" aria-label="Close annotation workbench" onClick={requestClose} />
        </div>
      </header>

      <ol className="annotation-workbench__steps list-unstyled d-flex mb-0 px-3 pt-3 gap-1" aria-label="Creation progress">
        {[
          ['geometry', 'Geometry'],
          ['data', 'Data'],
        ].map(([key, label], index) => {
          const active = step === key || (step === 'committing' && key === 'data');
          const complete = key === 'geometry' && (step === 'data' || step === 'committing');
          return (
            <li key={key} className={`annotation-workbench__step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}>
              <span>{complete ? '✓' : index + 1}</span>{label}
            </li>
          );
        })}
      </ol>

      <div className="annotation-workbench__body flex-grow-1 overflow-auto p-3">
        {isCreationGeometryStep && creationDraft ? (
          <section aria-labelledby="annotation-geometry-step-title">
            <h3 id="annotation-geometry-step-title" className="h6 mb-1">Geometry</h3>
            <p className="small text-muted mb-3">Draw a new geometry or choose one already available in this scene.</p>
            <div className="btn-group w-100 mb-3" role="group" aria-label="Geometry source">
              <button
                type="button"
                className={`btn ${creationDraft.geometryChoice === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={creationDraft.geometryChoice === 'new'}
                onClick={() => updateCreationDraft({ geometryChoice: 'new', selectedGeometryIds: [] })}
              >
                <i className="bi bi-pencil me-2" aria-hidden />Draw new
              </button>
              <button
                type="button"
                className={`btn ${creationDraft.geometryChoice === 'search' ? 'btn-primary' : 'btn-outline-primary'}`}
                aria-pressed={creationDraft.geometryChoice === 'search'}
                onClick={() => {
                  const dataChoice = creationDraft.dataChoice === 'void' ? 'new' : creationDraft.dataChoice;
                  updateCreationDraft({
                    geometryChoice: 'search',
                    dataChoice,
                    multiSide: normalizeMultiSideForChoices('search', dataChoice, creationDraft.multiSide),
                    draftShapes: [],
                    draftGeometryViewerId: null,
                  });
                }}
              >
                <i className="bi bi-list-check me-2" aria-hidden />Choose existing
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => updateCreationDraft({
                  step: 'data',
                  geometryChoice: 'void',
                  dataChoice: 'new',
                  multiSide: null,
                  draftShapes: [],
                  draftGeometryViewerId: null,
                  selectedGeometryIds: [],
                  selectedDataIds: [],
                })}
              >
                <i className="bi bi-skip-forward me-2" aria-hidden />Skip
              </button>
            </div>
            {creationDraft.geometryChoice === 'new' ? (
              <div className="alert alert-primary small" aria-live="polite">
                <i className="bi bi-mouse me-2" aria-hidden />
                Drawing is active in the viewer.
              </div>
            ) : null}
          </section>
        ) : null}

        {isCreationGeometrySearch && creationDraft ? (
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
                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between ${selected ? 'active' : ''}`}
                    onClick={() => setCreationGeometrySelection(
                      selected
                        ? creationDraft.selectedGeometryIds.filter((id) => id !== geometry.id)
                        : [...creationDraft.selectedGeometryIds, geometry.id],
                    )}
                  >
                    <span className="annotation-index-column me-2">
                      {displayNumber !== undefined ? (
                        <AnnotationIndexBadge kind="geometry" number={displayNumber} />
                      ) : null}
                    </span>
                    <span className="text-truncate" title={labels.join(', ') || 'Unlabelled geometry'}>{displayLabel}</span>
                    {!linkedGeometryIds.has(geometry.id) ? <span className="badge text-bg-light border ms-2 flex-shrink-0">Available · no links</span> : null}
                    <span className="small ms-2 flex-shrink-0">{geometry.shapes.length} shape{geometry.shapes.length === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {setupError ? <div className="alert alert-warning small mt-3 mb-0">{setupError}</div> : null}

        {isCreationDataStep && creationDraft ? (
          <section className="mt-3" aria-label="Annotation data">
            <AnnotationCreationDataStep
              draft={creationDraft}
              candidates={searchableData}
              displayNumbersById={dataNumbers}
              onToggleDataSelection={toggleCreationDataSelection}
              onOpenCreateModal={() => setDataEditorOpen(true)}
              onDataChoiceChange={(dataChoice) => updateCreationDraft({
                dataChoice,
                selectedDataIds: dataChoice === 'search' ? creationDraft.selectedDataIds : [],
                multiSide: dataChoice === 'search' && creationDraft.geometryChoice === 'search'
                  ? creationDraft.selectedGeometryIds.length > 1 ? 'geometry' : 'data'
                  : null,
              })}
            />
          </section>
        ) : null}
      </div>

      <footer className="annotation-workbench__footer border-top p-3 bg-light-subtle small">
        {creationDraft ? (
          <AnnotationCreationActionBar
            draft={creationDraft}
            creating={creating}
            onCreate={begin}
            onBack={back}
            onNext={() => void next()}
            onCancel={requestClose}
            nextButtonClassName="annotation-workbench__primary-action"
            middleAction={isCreationGeometryStep
              && creationDraft.geometryChoice === 'new'
              && creationDraft.draftShapes.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={creating}
                  onClick={() => void finishGeometryOnly()}
                >
                  <i className="bi bi-check-lg me-2" aria-hidden />Save geometry only
                </button>
              ) : null}
          />
        ) : null}
      </footer>

      {dataEditorOpen && creationDraft ? (
        <AnnotationDataFormModal
          title="Create annotation data"
          saveLabel="Use data"
          values={{
            label: creationDraft.newDataLabel,
            description: creationDraft.newDataDescription,
            annotationClass: creationDraft.newDataClass,
          }}
          saveDisabled={creationDraft.newDataLabel.trim().length === 0}
          onChange={(patch) => updateCreationDraft({
            ...(patch.label !== undefined ? { newDataLabel: patch.label } : {}),
            ...(patch.description !== undefined ? { newDataDescription: patch.description } : {}),
            ...(patch.annotationClass !== undefined ? { newDataClass: patch.annotationClass } : {}),
          })}
          onSave={() => setDataEditorOpen(false)}
          onCancel={() => setDataEditorOpen(false)}
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
    </aside>
  );
}
