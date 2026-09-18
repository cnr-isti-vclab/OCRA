import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './annotation-workbench.css';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import AnnotationCreationDataStep from '../annotation-creation/AnnotationCreationDataStep';
import AnnotationDataFormModal from '../annotation-creation/AnnotationDataFormModal';
import AnnotationCreationPanel, { AnnotationCreationActionBar } from '../annotation-creation/AnnotationCreationPanel';
import { buildAnnotationScopeOptions } from '../annotation-creation/buildAnnotationScopeOptions';
import { useAnnotationCreationWizard } from '../annotation-creation/useAnnotationCreationWizard';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';

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

/**
 * Non-modal authoring surface for Geometry, Data, and Link creation.
 * It deliberately leaves the viewer interactive while a draft is in progress.
 */
export default function AnnotationWorkbench({
  isOpen,
  sceneId,
  sceneLabel,
  sceneAssets = [],
  onClose,
}: AnnotationWorkbenchProps) {
  const {
    creationDraft,
    creating,
    initCreationDraft,
    updateCreationDraft,
    beginCreationWizard,
    advanceCreationStep,
    discardCreationDraft,
    vocabularySchemes,
    vocabularyConcepts,
    vocabularyProperties,
  } = useAnnotationStore();
  const { isCreationDataStep, isCreationGeometryStep, searchableData, toggleCreationDataSelection } =
    useAnnotationCreationWizard();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [dataEditorOpen, setDataEditorOpen] = useState(false);
  const [discardModal, setDiscardModal] = useState<MessageModalDescriptor | null>(null);
  const [isDetached, setIsDetached] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<FloatingWorkbenchPosition | null>(null);
  const hadCreationDraftRef = useRef(false);
  const wasOpenRef = useRef(false);

  const scopeOptions = useMemo(
    () => buildAnnotationScopeOptions({ sceneId, sceneLabel, assets: sceneAssets }),
    [sceneAssets, sceneId, sceneLabel],
  );

  useEffect(() => {
    if (isOpen && !wasOpenRef.current && !creationDraft) {
      initCreationDraft();
    }
    wasOpenRef.current = isOpen;
  }, [creationDraft, initCreationDraft, isOpen]);

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

  const step = creationDraft?.step ?? 'setup';
  const geometryCount = creationDraft?.geometryChoice === 'search'
    ? creationDraft.selectedGeometryIds.length
    : creationDraft?.draftShapes.length ?? 0;
  const dataCount = creationDraft?.dataChoice === 'search'
    ? creationDraft.selectedDataIds.length
    : creationDraft?.newDataLabel.trim().length ? 1 : 0;

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
          ['setup', 'Set up'],
          ['geometry', 'Geometry'],
          ['data', 'Data & link'],
        ].map(([key, label], index) => {
          const active = step === key || (step === 'committing' && key === 'data');
          const complete = (key === 'setup' && step !== 'setup') || (key === 'geometry' && (step === 'data' || step === 'committing'));
          return (
            <li key={key} className={`annotation-workbench__step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}>
              <span>{complete ? '✓' : index + 1}</span>{label}
            </li>
          );
        })}
      </ol>

      <div className="annotation-workbench__body flex-grow-1 overflow-auto p-3">
        {creationDraft ? (
          <AnnotationCreationPanel
            draft={creationDraft}
            scopeOptions={scopeOptions}
            creating={creating}
            setupError={setupError}
            onDraftChange={updateCreationDraft}
            onCreate={begin}
            onBack={requestClose}
            onNext={() => void next()}
            showActions={false}
          />
        ) : null}

        {isCreationGeometryStep ? (
          <section className="alert alert-primary small mb-0" aria-live="polite">
            <i className="bi bi-mouse me-2" aria-hidden />
            Work directly in the viewer to draw or select the geometry. Your draft remains visible here.
          </section>
        ) : null}

        {isCreationDataStep && creationDraft ? (
          <section className="mt-3" aria-label="Annotation data">
            <AnnotationCreationDataStep
              draft={creationDraft}
              candidates={searchableData}
              onToggleDataSelection={toggleCreationDataSelection}
              onOpenCreateModal={() => setDataEditorOpen(true)}
            />
          </section>
        ) : null}
      </div>

      <footer className="annotation-workbench__footer border-top p-3 bg-light-subtle small">
        <div className="fw-semibold mb-1">Draft summary</div>
        <div className="d-flex justify-content-between"><span>Geometry</span><span>{geometryCount || 'None'}</span></div>
        <div className="d-flex justify-content-between"><span>Data</span><span>{dataCount || 'None'}</span></div>
        {creationDraft ? (
          <div className="mt-3 pt-3 border-top">
            <AnnotationCreationActionBar
              draft={creationDraft}
              creating={creating}
              onCreate={begin}
              onBack={requestClose}
              onNext={() => void next()}
            />
          </div>
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
