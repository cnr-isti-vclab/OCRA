import { forwardRef, useEffect, useRef } from 'react';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../../adapters/three-presenter/ThreeJSViewer';
import { LoadingProgress } from '../../lib/ThreePresenter/src';
import type { SceneDescription } from '../../../../shared/scene-types';
import type { Annotation } from '../../../../shared/scene-types';
import { useAnnotations } from '../../context/AnnotationContext';

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
 * Component that encapsulates the 3D viewer with loading overlay
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
    // Annotation integration (moved from AnnotationPickerController)
    const { createAnnotation, annotations, setSelectedAnnotationIds } = useAnnotations();
    const prevSelectedRef = useRef<string[]>([]);

    // Set up 3D viewer point picking callback. Re-register when createAnnotation changes
    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) {
        console.warn('Viewer3DPanel: Viewer ref not available for setting up annotation picker');
        return;
      }

      const handler = (point: [number, number, number]) => {
        const newAnnotation: Annotation = {
          id: `annotation-${Date.now()}`,
          label: `Point ${new Date().toLocaleString()}`,
          type: 'point',
          geometry: point,
          createdAt: new Date().toISOString()
        } as Annotation;

        // call the latest createAnnotation
        createAnnotation(newAnnotation).catch(err => {
          console.error('Failed to create annotation from 3D viewer:', err);
        });
      };

      viewer.setOnPointPicked(handler);

      return () => {
        try {
          // only clear handler if still the same viewer
          viewer.setOnPointPicked(null);
        } catch (e) {
          // ignore
        }
      };
    }, [ref, createAnnotation]);

    // Render annotations when they change
    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) return;
      try {
        viewer.renderAnnotations(annotations);
      } catch (e) {
        // ignore render errors
      }
    }, [annotations, ref]);

    // Poll 3D viewer annotation manager for selection changes
    useEffect(() => {
      const viewer = (ref as React.RefObject<ThreeJSViewerRef>)?.current;
      if (!viewer) return;

      const interval = setInterval(() => {
        try {
          const annotationMgr = viewer.getAnnotationManager?.();
          if (annotationMgr) {
            const selectedIds: string[] = annotationMgr.getSelected?.() || [];
            if (JSON.stringify(selectedIds) !== JSON.stringify(prevSelectedRef.current)) {
              prevSelectedRef.current = selectedIds;
              setSelectedAnnotationIds(selectedIds);
            }
          }
        } catch (err) {
          // ignore
        }
      }, 200);

      return () => clearInterval(interval);
    }, [ref, setSelectedAnnotationIds]);

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
            <p style={{ color: '#999', fontSize: '14px' }}>Please add 3D assets to this project</p>
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
        {/* Loading overlay */}
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
