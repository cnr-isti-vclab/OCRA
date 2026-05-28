import { forwardRef, useEffect, useMemo, useRef } from 'react';
import OpenLIMEViewer, {
  type OpenLIMEViewerRef,
} from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { SceneDescription, ViewerAnnotation } from '../../../../shared/scene-types';
import { DigitalAsset } from '../HDTPage';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import {
  activeGeometriesToViewerAnnotations,
  dataIdsForFocusedGeometries,
  getViewerHighlightGeometryIds,
} from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { viewerGeometryToShapes } from '../../adapters/annotation-store/viewerAnnotationToShapes';
import {
  applyOpenLimeSelection,
  syncOpenLimeAnnotations,
} from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import { shapesEqual } from '../../adapters/annotation-store/shapesEqual';

interface Viewer2DPanelProps {
  sceneDesc: SceneDescription | null;
  digitalAssets: DigitalAsset[];
  rtiAvailable: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
}

/**
 * 2D (RTI) viewer wired to {@link AnnotationStore} active geometries and UI focus state.
 */
const Viewer2DPanel = forwardRef<OpenLIMEViewerRef, Viewer2DPanelProps>(
  ({ sceneDesc, digitalAssets, rtiAvailable, onReady, onError }, ref) => {
    const {
      activeGeometries,
      activeAnnotationSelection,
      revision,
      focusedDataIds,
      focusedGeometryIds,
      setFocusedGeometryIds,
      setFocusedDataIds,
      clearFocus,
      createAnnotation,
      updateGeometry,
    } = useAnnotationStore();

    const isStoreSyncRef = useRef(false);
    const expectedProgrammaticSelectionRef = useRef<string[] | null>(null);

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

    const highlightGeometryIdsRef = useRef(highlightGeometryIds);
    highlightGeometryIdsRef.current = highlightGeometryIds;

    const handleAnnotationCreated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current) {
        return;
      }
      void createAnnotation({
        shapes: viewerGeometryToShapes(anno.type, anno.geometry),
        label: anno.label || `Annotation ${new Date().toLocaleString()}`,
        description: anno.description ?? '',
        class: null,
        content: {},
      }).catch((err) => {
        console.error('Failed to create 2D annotation:', err);
      });
    };

    const handleAnnotationUpdated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current) {
        return;
      }
      const nextShapes = viewerGeometryToShapes(anno.type, anno.geometry);
      const existing = activeGeometries.find((g) => g.id === anno.id);
      if (existing && shapesEqual(existing.shapes, nextShapes)) {
        return;
      }
      void updateGeometry(anno.id, nextShapes).catch((err) => {
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
        // If it doesn't match, it is a real user selection; clear the expectation.
        expectedProgrammaticSelectionRef.current = null;
      }
      if (ids.length === 0) {
        clearFocus();
        return;
      }
      setFocusedGeometryIds(ids);
      setFocusedDataIds(dataIdsForFocusedGeometries(ids, activeAnnotationSelection));
    };

    const runStoreOpenLimeSync = (annotationManager: NonNullable<
      ReturnType<OpenLIMEViewerRef['getAnnotationManager']>
    >) => {
      isStoreSyncRef.current = true;
      try {
        syncOpenLimeAnnotations(annotationManager, viewerAnnotationsForSync);
      } finally {
        isStoreSyncRef.current = false;
      }
    };

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager();
      if (!annotationManager) {
        return;
      }
      runStoreOpenLimeSync(annotationManager);
      // Re-apply selection after shape sync — import/redraw can strip the selected CSS class.
      const idsToSelect = highlightGeometryIdsRef.current;
      if (idsToSelect.length > 0) {
        annotationManager.setMode('edit', false);
        expectedProgrammaticSelectionRef.current = normalizeIds(idsToSelect);
        applyOpenLimeSelection(annotationManager, idsToSelect);
      }
    }, [viewerAnnotationsForSync, ref]);

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager();
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
      annotationManager.setMode('edit', false);
      expectedProgrammaticSelectionRef.current = normalizeIds(highlightGeometryIds);
      applyOpenLimeSelection(annotationManager, highlightGeometryIds);
    }, [highlightGeometryIds, focusedDataIds, ref]);

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
      <OpenLIMEViewer
        ref={ref}
        sceneDesc={sceneDesc}
        digitalAssets={digitalAssets}
        onReady={onReady}
        onError={onError}
        onAnnotationCreated={handleAnnotationCreated}
        onAnnotationUpdated={handleAnnotationUpdated}
        onAnnotationSelectionChanged={handleAnnotationSelectionChange}
      />
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
