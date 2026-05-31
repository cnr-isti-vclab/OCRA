import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OpenLIMEViewer, {
  type OpenLIMEViewerRef,
} from '../../adapters/openlime-viewer/OpenLIMEViewer';
import { applyOpenLimeToolbarMode } from '../../adapters/openlime-viewer/openlimeToolbarMode';
import AnnotationToolbar, {
  type AnnotationToolbarMode,
} from '../../components/AnnotationToolbar';
import type { SceneDescription, ViewerAnnotation } from '../../../../shared/scene-types';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import { DigitalAsset } from '../HDTPage';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import {
  activeGeometriesToViewerAnnotations,
  dataIdsForFocusedGeometries,
  getViewerHighlightGeometryIds,
} from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { viewerGeometryToShapes } from '../../adapters/annotation-store/viewerAnnotationToShapes';
import {
  applyOpenLimeUnderEditing,
  applyOpenLimeSelection,
  syncOpenLimeAnnotations,
  type OpenLimeLabelVisibility,
  type OpenLimeAnnotationManager,
} from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import { shapesEqual } from '../../adapters/annotation-store/shapesEqual';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import {
  AnnotationMessageModalCatalog,
  type MessageModalDescriptor,
} from '../../shared/ui/AnnotationMessageModalModel';
import ViewerSettingsModal from '../../shared/ui/ViewerSettingsModal';

interface Viewer2DPanelProps {
  sceneDesc: SceneDescription | null;
  digitalAssets: DigitalAsset[];
  rtiAvailable: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
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
 * 2D (RTI) viewer wired to {@link AnnotationStore} active geometries and UI focus state.
 */
const Viewer2DPanel = forwardRef<OpenLIMEViewerRef, Viewer2DPanelProps>(
  ({ sceneDesc, digitalAssets, rtiAvailable, onReady, onError }, ref) => {
    const {
      activeGeometries,
      activeAnnotationSelection,
      activeSocialLocks,
      revision,
      focusedDataIds,
      focusedGeometryIds,
      setFocusedGeometryIds,
      setFocusedDataIds,
      setFocusSelection,
      clearFocus,
      createAnnotation,
      updateGeometry,
      startEditorLock,
      stopEditorLock,
    } = useAnnotationStore();

    const isStoreSyncRef = useRef(false);
    const expectedProgrammaticSelectionRef = useRef<string[] | null>(null);
    const editSnapshotsRef = useRef<Map<string, GeometryEditSnapshot>>(new Map());
    const isPointerDownRef = useRef(false);
    // Always-current refs for use inside pointer event handlers (avoids stale closures).
    const focusedGeometryIdsRef = useRef(focusedGeometryIds);
    focusedGeometryIdsRef.current = focusedGeometryIds;
    const activeGeometriesRef = useRef(activeGeometries);
    activeGeometriesRef.current = activeGeometries;
    const [toolbarMode, setToolbarMode] = useState<AnnotationToolbarMode>('edit');
    const [viewerReady, setViewerReady] = useState(false);
    const [pencilActive, setPencilActive] = useState(false);
    const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [labelVisibility, setLabelVisibility] = useState<OpenLimeLabelVisibility>('selected');
    const geometryEditorLockIdsRef = useRef<Set<string>>(new Set());
    const pendingConflictGeometryIdsRef = useRef<Set<string>>(new Set());

    const applyToolbarMode = useCallback(
      (mode: AnnotationToolbarMode) => {
        setToolbarMode(mode);
        const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
        const manager = viewer?.getAnnotationManager();
        if (!viewer || !manager) {
          return;
        }
        applyOpenLimeToolbarMode(manager, viewer, mode);
      },
      [ref],
    );

    const handlePencilActiveChange = useCallback((active: boolean) => {
      setPencilActive(active);
    }, []);

    const handleViewerReady = useCallback(() => {
      setViewerReady(true);
      onReady();
    }, [onReady]);

    function normalizeIds(ids: string[]): string[] {
      return [...ids].sort();
    }

    /** Stable labels for OpenLIME sync — exclude focus-driven label text to avoid resync storms. */
    const viewerAnnotationsForSync = useMemo(
      () =>
        activeGeometriesToViewerAnnotations(
          activeGeometries,
          activeAnnotationSelection,
          new Set(),
        ),
      [activeGeometries, activeAnnotationSelection, revision],
    );

    const highlightGeometryIds = useMemo(
      () =>
        getViewerHighlightGeometryIds(
          focusedGeometryIds,
          focusedDataIds,
          activeAnnotationSelection,
        ),
      [focusedGeometryIds, focusedDataIds, activeAnnotationSelection],
    );

    const lockedGeometryIds = useMemo(
      () =>
        activeSocialLocks
          .filter(
            (lock) =>
              lock.lockKind === 'editor' &&
              lock.resourceType === 'geometry' &&
              typeof lock.resourceId === 'string' &&
              lock.resourceId.length > 0,
          )
          .map((lock) => lock.resourceId as string),
      [activeSocialLocks],
    );

    const highlightGeometryIdsRef = useRef(highlightGeometryIds);
    highlightGeometryIdsRef.current = highlightGeometryIds;

    const handleAnnotationCreated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current) {
        return;
      }
      void createAnnotation({
        shapes: viewerGeometryToShapes(anno.type, anno.geometry),
        label: anno.label || '',
        description: anno.description ?? '',
        class: null,
        content: {},
      }).catch((err) => {
        console.error('Failed to create 2D annotation:', err);
      });
    };

    const captureGeometryEditSnapshot = (geometryId: string) => {
      if (editSnapshotsRef.current.has(geometryId)) {
        return;
      }
      const geo = activeGeometriesRef.current.find((g) => g.id === geometryId);
      if (!geo) {
        return;
      }
      editSnapshotsRef.current.set(geometryId, {
        version: geo.version,
        shapes: cloneShapes(geo.shapes),
      });
    };

    const handleAnnotationEditStart = (anno: ViewerAnnotation) => {
      // Capture the local editing copy at the exact OpenLIME edit start.
      captureGeometryEditSnapshot(anno.id);
    };

    const handleViewerPointerDown = () => {
      isPointerDownRef.current = true;
      // Snapshot focused geometries so any concurrent SSE update cannot replace the
      // OpenLIME object being dragged, and OCC still uses the edit-start version.
      for (const id of focusedGeometryIdsRef.current) {
        captureGeometryEditSnapshot(id);
      }
    };

    const handleViewerPointerUpOrCancel = useCallback(() => {
      isPointerDownRef.current = false;
      // RAF fires after OpenLIME's document-level pointerup handler (and thus after
      // handleAnnotationUpdated). Any snapshot still present was captured at pointer-down
      // but not consumed by a vertex drag — safe to drop unless it's a pending conflict.
      requestAnimationFrame(() => {
        for (const id of [...editSnapshotsRef.current.keys()]) {
          if (!pendingConflictGeometryIdsRef.current.has(id)) {
            editSnapshotsRef.current.delete(id);
          }
        }
      });
    }, []);

    useEffect(() => {
      const handleGlobalPointerEnd = () => {
        if (isPointerDownRef.current) {
          handleViewerPointerUpOrCancel();
        }
      };

      window.addEventListener('pointerup', handleGlobalPointerEnd);
      window.addEventListener('pointercancel', handleGlobalPointerEnd);

      return () => {
        window.removeEventListener('pointerup', handleGlobalPointerEnd);
        window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      };
    }, [handleViewerPointerUpOrCancel]);

    const handleAnnotationUpdated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current) {
        return;
      }
      const nextShapes = viewerGeometryToShapes(anno.type, anno.geometry);
      const editSnapshot = editSnapshotsRef.current.get(anno.id);
      const baselineShapes =
        editSnapshot?.shapes ?? activeGeometriesRef.current.find((g) => g.id === anno.id)?.shapes;
      if (baselineShapes && shapesEqual(baselineShapes, nextShapes)) {
        editSnapshotsRef.current.delete(anno.id);
        return;
      }
      const expectedVersion = editSnapshot?.version;
      void updateGeometry(anno.id, nextShapes, {
        expectedVersion,
        optimistic: false,
      })
        .then(() => {
          editSnapshotsRef.current.delete(anno.id);
        })
        .catch((err) => {
          if (err instanceof AnnotationApiError && err.status === 409) {
            pendingConflictGeometryIdsRef.current.add(anno.id);
            setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_geometry'));
            return;
          }

          editSnapshotsRef.current.delete(anno.id);
          console.error('Failed to update 2D annotation geometry:', err);
        });
    };

    const handleAnnotationSelectionChange = (ids: string[]) => {
      // Ignore selectionChange events caused by store-driven sync/selection.
      // (OpenLIME may emit transient empty selections during a sync pass.)
      if (isStoreSyncRef.current) {
        return;
      }

      const expected = expectedProgrammaticSelectionRef.current;
      if (expected) {
        const normalized = normalizeIds(ids);
        if (
          normalized.length === expected.length &&
          normalized.every((id, idx) => id === expected[idx])
        ) {
          expectedProgrammaticSelectionRef.current = null;
          return;
        }
        // OpenLIME may emit a transient empty selection when the pencil is enabled.
        if (expected.length > 0 && ids.length === 0) {
          return;
        }
        // If it doesn't match, it is a real user selection; clear the expectation.
        expectedProgrammaticSelectionRef.current = null;
      }
      if (ids.length === 0) {
        clearFocus();
        return;
      }
      setFocusSelection({
        geometryIds: ids,
        dataIds: dataIdsForFocusedGeometries(ids, activeAnnotationSelection),
      });
    };

    const runStoreOpenLimeSync = (annotationManager: OpenLimeAnnotationManager) => {
      isStoreSyncRef.current = true;
      try {
        // While a geometry has a local edit snapshot, block store-driven shape sync
        // for that id. The user edits the OpenLIME copy captured at pointer/edit start;
        // remote store changes remain in the store and will surface after the edit ends.
        const excludeIds = new Set(editSnapshotsRef.current.keys());
        if (excludeIds.size === 0 && isPointerDownRef.current) {
          for (const id of focusedGeometryIdsRef.current) {
            excludeIds.add(id);
          }
        }
        syncOpenLimeAnnotations(annotationManager, viewerAnnotationsForSync, excludeIds);
      } finally {
        isStoreSyncRef.current = false;
      }
    };

    const releaseConflictSnapshotsAndSync = useCallback(() => {
      for (const id of pendingConflictGeometryIdsRef.current) {
        editSnapshotsRef.current.delete(id);
      }
      pendingConflictGeometryIdsRef.current.clear();
      setMessageModal(null);

      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      const annotationManager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }

      runStoreOpenLimeSync(annotationManager);
      const idsToSelect = highlightGeometryIdsRef.current;
      if (idsToSelect.length > 0) {
        expectedProgrammaticSelectionRef.current = normalizeIds(idsToSelect);
        applyOpenLimeSelection(annotationManager, idsToSelect);
      }
      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [lockedGeometryIds, ref, viewerAnnotationsForSync]);

    const syncGeometryEditorLocks = useCallback(
      async (geometryIds: string[]) => {
        const prev = geometryEditorLockIdsRef.current;
        const next = new Set(geometryIds);

        const toStart = [...next].filter((id) => !prev.has(id));
        const toStop = [...prev].filter((id) => !next.has(id));

        for (const id of toStart) {
          captureGeometryEditSnapshot(id);
        }
        for (const id of toStop) {
          editSnapshotsRef.current.delete(id);
        }

        await Promise.all([
          ...toStart.map((id) =>
            startEditorLock('geometry', id, 'editing annotation geometry').catch((err) => {
              console.warn('Failed to publish geometry editor lock:', err);
            }),
          ),
          ...toStop.map((id) =>
            stopEditorLock('geometry', id, 'editing annotation geometry').catch((err) => {
              console.warn('Failed to release geometry editor lock:', err);
            }),
          ),
        ]);

        geometryEditorLockIdsRef.current = next;
      },
      [startEditorLock, stopEditorLock],
    );

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }
      runStoreOpenLimeSync(annotationManager);
      // Re-apply selection after shape sync — import/redraw can strip the selected CSS class.
      const idsToSelect = highlightGeometryIdsRef.current;
      if (idsToSelect.length > 0) {
        ref.current?.enableEditing(true);
        expectedProgrammaticSelectionRef.current = normalizeIds(idsToSelect);
        applyOpenLimeSelection(annotationManager, idsToSelect);
      }
      // A geometry sync can recreate SVG nodes; re-apply remote underEditing classes.
      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [viewerAnnotationsForSync, lockedGeometryIds, ref]);

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }
      if (highlightGeometryIds.length === 0 && focusedDataIds.size === 0) {
        expectedProgrammaticSelectionRef.current = [];
        annotationManager.deselectAll();
        return;
      }

      if (highlightGeometryIds.length === 0) {
        return;
      }
      ref.current?.enableEditing(true);
      expectedProgrammaticSelectionRef.current = normalizeIds(highlightGeometryIds);
      applyOpenLimeSelection(annotationManager, highlightGeometryIds);
    }, [highlightGeometryIds, focusedDataIds, ref]);

    // Keep editor social locks aligned with this viewer's focused geometries.
    useEffect(() => {
      void syncGeometryEditorLocks([...focusedGeometryIds]);
    }, [focusedGeometryIds, syncGeometryEditorLocks]);

    // Apply remote geometry editor locks as OpenLIME underEditing style.
    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }

      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [lockedGeometryIds, ref]);

    useEffect(() => {
      return () => {
        const locked = [...geometryEditorLockIdsRef.current];
        geometryEditorLockIdsRef.current = new Set();
        locked.forEach((id) => {
          void stopEditorLock('geometry', id, 'editing annotation geometry').catch(() => {
            // best-effort cleanup
          });
        });
      };
    }, [stopEditorLock]);

    if (!rtiAvailable) {
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
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📸</div>
            <p style={{ color: '#666', marginBottom: '8px' }}>No RTI (2D) assets available</p>
            <p style={{ color: '#999', fontSize: '14px' }}>Please add RTI assets to this project</p>
          </div>
        </div>
      );
    }

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
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📸</div>
            <p style={{ color: '#666', marginBottom: '8px' }}>Scene description not available</p>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onPointerDown={handleViewerPointerDown}
        onPointerUp={handleViewerPointerUpOrCancel}
        onPointerCancel={handleViewerPointerUpOrCancel}
      >
        <OpenLIMEViewer
          ref={ref}
          sceneDesc={sceneDesc}
          digitalAssets={digitalAssets}
          onReady={handleViewerReady}
          onError={onError}
          onAnnotationCreated={handleAnnotationCreated}
          onAnnotationEditStart={handleAnnotationEditStart}
          onAnnotationUpdated={handleAnnotationUpdated}
          onAnnotationSelectionChanged={handleAnnotationSelectionChange}
          onPencilActiveChange={handlePencilActiveChange}
          onSettingsRequested={() => setSettingsOpen(true)}
          annotationLabelVisibility={labelVisibility}
        />
        {pencilActive && viewerReady && (
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
            <AnnotationToolbar mode={toolbarMode} onModeChange={applyToolbarMode} />
          </div>
        )}
        <AppMessageModal
          descriptor={messageModal}
          onClose={releaseConflictSnapshotsAndSync}
          onAction={releaseConflictSnapshotsAndSync}
        />
        <ViewerSettingsModal
          isOpen={settingsOpen}
          labelVisibility={labelVisibility}
          onLabelVisibilityChange={setLabelVisibility}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
