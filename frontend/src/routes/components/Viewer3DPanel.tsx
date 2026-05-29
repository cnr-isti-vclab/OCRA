import { forwardRef, useEffect, useMemo, useRef } from 'react';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../../adapters/three-presenter/ThreeJSViewer';
import { LoadingProgress } from 'three-presenter';
import type { SceneDescription } from '../../../../shared/scene-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import {
  activeGeometriesToViewerAnnotations,
  dataIdsForFocusedGeometries,
  getViewerHighlightGeometryIds,
} from '../../adapters/annotation-store/geometryToViewerAnnotation';

interface Viewer3DPanelProps {
  sceneDesc: SceneDescription | null;
  loadingModels: boolean;
  modelLoadProgress: Record<string, number>;
  onReady: () => void;
  onLoadProgress: (progress: LoadingProgress) => void;
  onLoadComplete: (modelId: string) => void;
  onLoadError: (modelId: string, error: Error) => void;
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
      onLoadError
    },
    ref
  ) => {
    const {
      activeGeometries,
      activeAnnotationSelection,
      focusedDataIds,
      focusedGeometryIds,
      setFocusedGeometryIds,
      setFocusedDataIds,
      setFocusSelection,
      clearFocus,
      createAnnotation,
    } = useAnnotationStore();

    const prevSelectedRef = useRef<string[]>([]);

    const viewerAnnotations = useMemo(
      () =>
        activeGeometriesToViewerAnnotations(
          activeGeometries,
          activeAnnotationSelection,
          focusedDataIds,
        ),
      [activeGeometries, activeAnnotationSelection, focusedDataIds],
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

    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      const handler = (point: [number, number, number]) => {
        void createAnnotation({
          shapes: [{ type: 'ShapePoints', vertices: [point] }],
          label: `Point ${new Date().toLocaleString()}`,
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
    }, [ref, createAnnotation]);

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
        annotationMgr.clearSelection();
        if (highlightGeometryIds.length > 0) {
          annotationMgr.select(highlightGeometryIds, false);
        }
      } catch {
        // ignore
      }
    }, [highlightGeometryIds, ref]);

    // Viewer pick → geometry / linked data focus
    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      const interval = setInterval(() => {
        try {
          const annotationMgr = viewer.getAnnotationManager?.();
          if (!annotationMgr) {
            return;
          }
          const selectedIds: string[] = annotationMgr.getSelected?.() || [];
          if (JSON.stringify(selectedIds) === JSON.stringify(prevSelectedRef.current)) {
            return;
          }
          prevSelectedRef.current = selectedIds;

          if (selectedIds.length === 0) {
            clearFocus();
          } else {
            setFocusSelection({
              geometryIds: selectedIds,
              dataIds: dataIdsForFocusedGeometries(selectedIds, activeAnnotationSelection),
            });
          }
        } catch {
          // ignore
        }
      }, 200);

      return () => clearInterval(interval);
    }, [ref, clearFocus, setFocusSelection, activeAnnotationSelection]);

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
      <>
        <ThreeJSViewer
          ref={ref}
          height="100%"
          sceneDesc={sceneDesc}
          onReady={onReady}
          onLoadProgress={onLoadProgress}
          onLoadComplete={onLoadComplete}
          onLoadError={onLoadError}
        />
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
      </>
    );
  }
);

Viewer3DPanel.displayName = 'Viewer3DPanel';

export default Viewer3DPanel;
