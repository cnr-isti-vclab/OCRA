import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../../adapters/three-presenter/ThreeJSViewer';
import { LoadingProgress } from 'three-presenter';
import type { SceneDescription, ViewerAnnotation } from '../../../../shared/scene-types';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { useAnnotationLinkView } from '../../features/annotation-link-view/useAnnotationLinkView';
import { CREATION_DRAFT_GEOMETRY_ID } from '../../features/annotation-creation/constants';
import { draftShapesToViewerAnnotation } from '../../features/annotation-creation/draftGeometryToViewerAnnotation';
import { hasPendingCreationDraftShapes } from '../../features/annotation-creation/creationDraftGeometry';
import { useAnnotationCreationWizard } from '../../features/annotation-creation/useAnnotationCreationWizard';
import {
  resolveCreationToolbarMode,
} from '../../features/annotation-creation/resolveCreationToolbarMode';
import AnnotationToolbar, {
  type AnnotationToolbarMode,
} from '../../components/AnnotationToolbar';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import {
  activeGeometriesToViewerAnnotations,
  dataIdsForFocusedGeometries,
  getViewerHighlightGeometryIds,
} from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { viewerGeometryToShapes } from '../../adapters/annotation-store/viewerAnnotationToShapes';
import { shapesEqual } from '../../adapters/annotation-store/shapesEqual';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import {
  AnnotationMessageModalCatalog,
} from '../../shared/ui/AnnotationMessageModalCatalog';
import type { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';

interface Viewer3DPanelProps {
  sceneDesc: SceneDescription | null;
  loadingModels: boolean;
  modelLoadProgress: Record<string, number>;
  onReady: () => void;
  onLoadProgress: (progress: LoadingProgress) => void;
  onLoadComplete: (modelId: string) => void;
  onLoadError: (modelId: string, error: Error) => void;
  annotationToolsVisible: boolean;
}

interface GeometryEditSnapshot {
  version: number;
  shapes: AnnotationShape[];
}

function cloneShapes(shapes: AnnotationShape[]): AnnotationShape[] {
  return shapes.map((shape) => ({
    ...shape,
    vertices: shape.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]]),
  }));
}

/**
 * 3D viewer wired to {@link AnnotationStore} active geometries and UI focus state.
 */
const Viewer3DPanel = forwardRef<ThreeJSViewerRef, Viewer3DPanelProps>(
  (
    {
      sceneDesc,
      loadingModels,
      modelLoadProgress,
      onReady,
      onLoadProgress,
      onLoadComplete,
      onLoadError,
      annotationToolsVisible,
    },
    ref
  ) => {
    const {
      activeAnnotationSelection,
      focusedDataIds,
      focusedGeometryIds,
      setFocusSelection,
      clearFocus,
      createAnnotation,
      updateGeometry,
    } = useAnnotationStore();
    const { visibleGeometries } = useAnnotationLinkView();
    const {
      creationDraft,
      isCreationGeometryNew,
      isCreationGeometrySearch,
      isCreationWizardActive,
      isCreationPendingNewGeometry,
      blockImmediateAnnotationCreate,
      creationHighlightGeometryIds,
      searchableGeometries,
      setCreationDraftShapes,
      setCreationGeometrySelection,
    } = useAnnotationCreationWizard();

    const expectedProgrammaticSelectionRef = useRef<string[] | null>(null);
    const activeGeometriesRef = useRef(visibleGeometries);
    activeGeometriesRef.current = visibleGeometries;
    const editSnapshotsRef = useRef<Map<string, GeometryEditSnapshot>>(new Map());
    const [toolbarMode, setToolbarMode] = useState<AnnotationToolbarMode>('edit');
    const [viewerReady, setViewerReady] = useState(false);
    const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
    const isCreationGeometryNewRef = useRef(isCreationGeometryNew);
    isCreationGeometryNewRef.current = isCreationGeometryNew;
    const wasCreationGeometryNewRef = useRef(false);

    const handleViewerReady = useCallback(() => {
      setViewerReady(true);
      onReady();
    }, [onReady]);

    const viewerAnnotations = useMemo(
      () => {
        const base = activeGeometriesToViewerAnnotations(
          visibleGeometries,
          activeAnnotationSelection,
          focusedDataIds,
        );
        if (
          creationDraft
          && hasPendingCreationDraftShapes(creationDraft)
          && !creationDraft.draftGeometryViewerId
        ) {
          const draftAnnotation = draftShapesToViewerAnnotation(creationDraft.draftShapes);
          if (draftAnnotation) {
            return [...base, { ...draftAnnotation, strokeDasharray: null }];
          }
        }
        return base;
      },
      [visibleGeometries, activeAnnotationSelection, focusedDataIds, creationDraft],
    );

    const highlightGeometryIds = useMemo(
      () => {
        if (creationHighlightGeometryIds !== null) {
          return creationHighlightGeometryIds;
        }
        return getViewerHighlightGeometryIds(
          focusedGeometryIds,
          focusedDataIds,
          activeAnnotationSelection,
        );
      },
      [
        creationHighlightGeometryIds,
        focusedGeometryIds,
        focusedDataIds,
        activeAnnotationSelection,
      ],
    );

    function normalizeIds(ids: string[]): string[] {
      return [...ids].sort();
    }

    const resolveToolbarMode = useCallback(
      (currentMode: AnnotationToolbarMode = toolbarMode): AnnotationToolbarMode =>
        resolveCreationToolbarMode(currentMode, {
          isCreationGeometryNew,
          isCreationGeometrySearch,
          defaultCreateMode: 'point',
        }),
      [isCreationGeometryNew, isCreationGeometrySearch, toolbarMode],
    );

    const applyToolbarMode = useCallback((mode: AnnotationToolbarMode) => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      if (mode === 'point') {
        viewer.setPickingMode(true);
        setToolbarMode('point');
        return;
      }

      viewer.setPickingMode(false);
      setToolbarMode('edit');
    }, [ref]);

    const keepCreationPointPickingActive = useCallback(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }
      requestAnimationFrame(() => {
        if (!isCreationGeometryNewRef.current) {
          return;
        }
        viewer.setPickingMode(true);
        setToolbarMode('point');
      });
    }, [ref]);

    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer || !viewerReady) {
        return;
      }

      const handler = (point: [number, number, number]) => {
        if (isCreationGeometryNew) {
          setCreationDraftShapes([{ type: 'ShapePoints', vertices: [point] }]);
          keepCreationPointPickingActive();
          return;
        }

        if (blockImmediateAnnotationCreate) {
          return;
        }

        void createAnnotation({
          shapes: [{ type: 'ShapePoints', vertices: [point] }],
          label: '',
          description: '',
          class: null,
          content: {},
        }).catch((err) => {
          console.error('Failed to create annotation from 3D viewer:', err);
        });
      };

      viewer.setOnPointPicked(handler);

      return () => {
        try {
          viewer.setOnPointPicked(null);
        } catch {
          // ignore
        }
      };
    }, [
      ref,
      viewerReady,
      createAnnotation,
      isCreationGeometryNew,
      blockImmediateAnnotationCreate,
      setCreationDraftShapes,
      keepCreationPointPickingActive,
    ]);

    const viewer3dDisabledModes = useMemo((): AnnotationToolbarMode[] => {
      if (isCreationGeometrySearch) {
        return ['point', 'line', 'area'];
      }
      if (isCreationGeometryNew) {
        return ['edit', 'line', 'area'];
      }
      return ['line', 'area'];
    }, [isCreationGeometryNew, isCreationGeometrySearch]);

    useEffect(() => {
      if (!viewerReady) {
        return;
      }
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      if (isCreationGeometryNew) {
        const effectiveMode = resolveToolbarMode();
        if (effectiveMode !== toolbarMode) {
          setToolbarMode(effectiveMode);
        }
        applyToolbarMode(effectiveMode);
        return;
      }

      if (isCreationGeometrySearch) {
        if (toolbarMode !== 'edit') {
          setToolbarMode('edit');
        }
        applyToolbarMode('edit');
        return;
      }

      if (isCreationWizardActive) {
        viewer.setPickingMode(false);
        if (toolbarMode !== 'edit') {
          setToolbarMode('edit');
        }
      }
    }, [
      isCreationGeometryNew,
      isCreationGeometrySearch,
      isCreationWizardActive,
      toolbarMode,
      applyToolbarMode,
      resolveToolbarMode,
      ref,
      viewerReady,
    ]);

    useEffect(() => {
      if (!viewerReady) {
        return;
      }
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      if (wasCreationGeometryNewRef.current && !isCreationGeometryNew) {
        viewer.setPickingMode(false);
        setToolbarMode('edit');
      }
      wasCreationGeometryNewRef.current = isCreationGeometryNew;
    }, [isCreationGeometryNew, ref, viewerReady]);

    useEffect(() => {
      if (annotationToolsVisible || isCreationGeometryNew || isCreationGeometrySearch) {
        return;
      }
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }
      viewer.setPickingMode(false);
      setToolbarMode('edit');
    }, [annotationToolsVisible, isCreationGeometryNew, isCreationGeometrySearch, ref]);

    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }
      try {
        viewer.renderAnnotations(viewerAnnotations);
      } catch {
        // ignore render errors
      }
    }, [viewerAnnotations, ref]);

    // Panel / focus → viewer geometry highlight
    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }
      try {
        const annotationMgr = viewer.getAnnotationManager?.();
        if (!annotationMgr) {
          return;
        }
        const currentSelection = normalizeIds(annotationMgr.getSelected?.() || []);
        const nextSelection = normalizeIds(highlightGeometryIds);
        if (
          currentSelection.length === nextSelection.length &&
          currentSelection.every((id, index) => id === nextSelection[index])
        ) {
          return;
        }

        expectedProgrammaticSelectionRef.current = nextSelection;
        if (nextSelection.length === 0) {
          annotationMgr.clearSelection();
        } else {
          annotationMgr.clearSelection();
          annotationMgr.select(nextSelection, false);
        }
      } catch {
        // ignore
      }
    }, [highlightGeometryIds, ref]);

    const handleAnnotationSelectionChanged = (ids: string[]) => {
      const expected = expectedProgrammaticSelectionRef.current;
      if (expected) {
        const normalized = normalizeIds(ids);
        if (
          normalized.length === expected.length &&
          normalized.every((id, index) => id === expected[index])
        ) {
          expectedProgrammaticSelectionRef.current = null;
          return;
        }
        if (expected.length > 0 && ids.length === 0) {
          return;
        }
        expectedProgrammaticSelectionRef.current = null;
      }

      if (ids.length === 0) {
        if (isCreationGeometrySearch) {
          setCreationGeometrySelection([]);
        } else {
          clearFocus();
        }
        return;
      }

      if (isCreationGeometrySearch) {
        const searchableIds = new Set(searchableGeometries.map((geometry) => geometry.id));
        const filtered = ids.filter(
          (id) => id !== CREATION_DRAFT_GEOMETRY_ID && searchableIds.has(id),
        );
        setCreationGeometrySelection(filtered);
        return;
      }

      setFocusSelection({
        geometryIds: ids,
        dataIds: dataIdsForFocusedGeometries(ids, activeAnnotationSelection),
      });
    };

    const handlePickingModeChange = (enabled: boolean) => {
      if (isCreationGeometryNew) {
        setToolbarMode('point');
        if (!enabled) {
          keepCreationPointPickingActive();
        }
        return;
      }
      setToolbarMode(enabled ? 'point' : 'edit');
    };

    const handleAnnotationEditStart = (annotation: ViewerAnnotation) => {
      if (editSnapshotsRef.current.has(annotation.id)) {
        return;
      }
      if (
        creationDraft?.draftGeometryViewerId
        && annotation.id === creationDraft.draftGeometryViewerId
      ) {
        editSnapshotsRef.current.set(annotation.id, {
          version: 0,
          shapes: cloneShapes(creationDraft.draftShapes),
        });
        return;
      }
      if (annotation.id === CREATION_DRAFT_GEOMETRY_ID && creationDraft) {
        editSnapshotsRef.current.set(annotation.id, {
          version: 0,
          shapes: cloneShapes(creationDraft.draftShapes),
        });
        return;
      }
      const geometry = activeGeometriesRef.current.find((item) => item.id === annotation.id);
      if (!geometry) {
        return;
      }
      editSnapshotsRef.current.set(annotation.id, {
        version: geometry.version,
        shapes: cloneShapes(geometry.shapes),
      });
    };

    const handleAnnotationUpdated = (annotation: ViewerAnnotation) => {
      const nextShapes = viewerGeometryToShapes(annotation.type, annotation.geometry);

      const draftViewerId = creationDraft?.draftGeometryViewerId;
      if (draftViewerId && annotation.id === draftViewerId) {
        if (isCreationPendingNewGeometry) {
          setCreationDraftShapes(nextShapes);
        }
        editSnapshotsRef.current.delete(annotation.id);
        return;
      }

      if (annotation.id === CREATION_DRAFT_GEOMETRY_ID) {
        if (isCreationPendingNewGeometry) {
          setCreationDraftShapes(nextShapes);
        }
        editSnapshotsRef.current.delete(annotation.id);
        return;
      }

      const snapshot = editSnapshotsRef.current.get(annotation.id);
      const baselineShapes =
        snapshot?.shapes ?? activeGeometriesRef.current.find((item) => item.id === annotation.id)?.shapes;
      if (baselineShapes && shapesEqual(baselineShapes, nextShapes)) {
        editSnapshotsRef.current.delete(annotation.id);
        return;
      }

      void updateGeometry(annotation.id, nextShapes, {
        expectedVersion: snapshot?.version,
        optimistic: false,
      })
        .then(() => {
          editSnapshotsRef.current.delete(annotation.id);
        })
        .catch((err) => {
          if (err instanceof AnnotationApiError && err.status === 409) {
            setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_geometry'));
            return;
          }
          editSnapshotsRef.current.delete(annotation.id);
          console.error('Failed to update 3D annotation geometry:', err);
        });
    };

    const releaseConflictSnapshot = () => {
      editSnapshotsRef.current.clear();
      setMessageModal(null);
    };

    if (!sceneDesc) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#f5f5f5'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📦</div>
            <p style={{ color: '#666', marginBottom: '8px' }}>No 3D models available</p>
            <p style={{ color: '#999', fontSize: '14px' }}>Upload 3D models to this project to view them</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <ThreeJSViewer
          ref={ref}
          height="100%"
          sceneDesc={sceneDesc}
          onReady={handleViewerReady}
          onLoadProgress={onLoadProgress}
          onLoadComplete={onLoadComplete}
          onLoadError={onLoadError}
          onAnnotationSelectionChanged={handleAnnotationSelectionChanged}
          onPickingModeChange={handlePickingModeChange}
          onAnnotationEditStart={handleAnnotationEditStart}
          onAnnotationUpdated={handleAnnotationUpdated}
        />
        {(annotationToolsVisible || isCreationWizardActive) && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <AnnotationToolbar
              mode={toolbarMode}
              onModeChange={applyToolbarMode}
              disabledModes={viewer3dDisabledModes}
            />
          </div>
        )}
        {loadingModels && Object.keys(modelLoadProgress).length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontFamily: 'sans-serif',
              zIndex: 1000,
              pointerEvents: 'none'
            }}
          >
            <div style={{ textAlign: 'center', maxWidth: '400px', width: '90%' }}>
              <div style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 500 }}>
                Loading 3D Models...
              </div>
              {Object.entries(modelLoadProgress).map(([modelId, percentage]) => (
                <div key={modelId} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '14px', marginBottom: '6px', opacity: 0.9 }}>
                    {modelId}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #4CAF50, #8BC34A)',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                    {Math.round(percentage)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <AppMessageModal
          descriptor={messageModal}
          onClose={releaseConflictSnapshot}
          onAction={releaseConflictSnapshot}
        />
      </div>
    );
  }
);

Viewer3DPanel.displayName = 'Viewer3DPanel';

export default Viewer3DPanel;
