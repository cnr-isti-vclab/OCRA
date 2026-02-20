/**
 * AnnotationPickerController
 * Connects the 3D/2D viewers with the AnnotationContext
 * Handles point picking callbacks and creates annotations
 */

import { useEffect, useRef } from 'react';
import type { Annotation } from '../../../../shared/scene-types';
import type { ThreeJSViewerRef } from '../../adapters/three-presenter/ThreeJSViewer';
import type { OpenLIMEViewerRef } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import { useAnnotations } from '../../context/AnnotationContext';

interface AnnotationPickerControllerProps {
  mode: '3d' | '2d';
  viewerRef3D: React.RefObject<ThreeJSViewerRef | null> | null;
  viewerRef2D: React.RefObject<OpenLIMEViewerRef | null> | null;
}

/**
 * Controller component that sets up annotation picking callbacks
 * for both 2D and 3D viewers
 */
export default function AnnotationPickerController({
  mode,
  viewerRef3D,
  viewerRef2D
}: AnnotationPickerControllerProps) {
  const { createAnnotation, annotations, selectAnnotation, setSelectedAnnotationIds } = useAnnotations();
  const prevSelectedRef = useRef<string[]>([]);

  // Set up 3D viewer point picking callback
  useEffect(() => {
    if (mode !== '3d' || !viewerRef3D?.current) return;

    console.log('🎯 Setting up 3D annotation picker');

    const viewer = viewerRef3D.current;
    if (!viewer) return;
    
    // Set the point picking callback
    viewer.setOnPointPicked((point: [number, number, number]) => {
      console.log('📍 3D Point picked, creating annotation:', point);

      const newAnnotation: Annotation = {
        id: `annotation-${Date.now()}`,
        label: `Point ${new Date().toLocaleString()}`,
        type: 'point',
        geometry: point,
        createdAt: new Date().toISOString()
      };

      createAnnotation(newAnnotation).catch(err => {
        console.error('Failed to create annotation from 3D viewer:', err);
      });
    });

    return () => {
      // Clean up: remove callback when unmounting or switching mode
      viewer.setOnPointPicked(null);
    };
  }, [mode, viewerRef3D, createAnnotation]);

  // Render annotations in 3D viewer when they change
  useEffect(() => {
    if (mode !== '3d' || !viewerRef3D?.current) return;

    console.log('🎨 Rendering annotations in 3D viewer:', annotations.length);
    viewerRef3D.current.renderAnnotations(annotations);
  }, [mode, viewerRef3D, annotations]);

  // Set up annotation selection callback for 3D viewer
  useEffect(() => {
    if (mode !== '3d' || !viewerRef3D?.current) return;

    console.log('🔗 Setting up 3D annotation selection polling');

    const viewer = viewerRef3D.current;
    if (!viewer) return;

    // Poll for annotation selection changes in 3D viewer
    const interval = setInterval(() => {
      try {
        const annotationMgr = viewer.getAnnotationManager();
        if (annotationMgr) {
          const selectedIds = annotationMgr.getSelected();
          
          // Check if selection changed
          if (JSON.stringify(selectedIds) !== JSON.stringify(prevSelectedRef.current)) {
            console.log('3D Annotation selection changed:', selectedIds);
            prevSelectedRef.current = selectedIds;
            
            // Update context with new selection (preserving multi-select)
            setSelectedAnnotationIds(selectedIds);
          }
        }
      } catch (err) {
        // Silently ignore errors during polling
      }
    }, 200); // Poll every 200ms

    return () => {
      clearInterval(interval);
    };
  }, [mode, viewerRef3D, setSelectedAnnotationIds]);

  // Note: 2D viewer callbacks are already set up in Viewer2DPanel
  // through the Viewer2DPanel component which uses useAnnotations directly

  return null; // This is a controller component, doesn't render anything
}
