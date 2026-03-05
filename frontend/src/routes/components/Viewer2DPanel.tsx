import { forwardRef, useEffect, useRef } from 'react';
import OpenLIMEViewer, { type OpenLIMEViewerRef, type SimplifiedAnnotation } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { SceneDescription, Annotation } from '../../../../shared/scene-types';
import { DigitalAsset } from '../HDTPage';
import { useAnnotations } from '../../context/AnnotationContext';

interface Viewer2DPanelProps {
  sceneDesc: SceneDescription | null;
  digitalAssets: DigitalAsset[];
  rtiAvailable: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
}

/**
 * Component that encapsulates the 2D (RTI) viewer
 */
const Viewer2DPanel = forwardRef<OpenLIMEViewerRef, Viewer2DPanelProps>(
  ({ sceneDesc, digitalAssets, rtiAvailable, onReady, onError }, ref) => {
    const { createAnnotation, updateAnnotationGeometry, selectAnnotation, selectedAnnotationIds, annotations } = useAnnotations();

    // Guard counter: tracks how many programmatic setSelected calls are in flight.
    // Each call causes OpenLIME to echo an onSelect event; we suppress exactly that many
    // echoes to avoid bouncing the selection back into the context and looping.
    const isProgrammaticSelectionRef = useRef(0);

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

    // Handle forward annotation creation from viewer to context, then to the annotationPanel
    const handleAnnotationCreated = (anno: Annotation) => {
      createAnnotation(anno);
    };

    // Handle forward annotation update from viewer to context, then to the annotationPanel
    const handleAnnotationUpdated = (anno: Annotation) => {
      updateAnnotationGeometry(anno.id, anno.geometry);
    };

    // Handle forward annotation deletion from viewer to context, then to the annotationPanel
    const handleAnnotationDeleted = (anno: Annotation) => {
      // Annotation deletion is handled through AnnotationPanel's delete button
      // When viewer wants to delete, it should go through the same path
    };

    // Handle forward annotation selection from viewer to context, then to the annotationPanel
    const handleAnnotationSelected = (id: string) => {
      // If the selection was pushed programmatically (context → viewer), OpenLIME still
      // fires onSelect for its own visual update — ignore that echo to avoid a loop.
      if (isProgrammaticSelectionRef.current > 0) {
        isProgrammaticSelectionRef.current--;
        return;
      }
      // Update selection called from viewer, and update the context then the annotationPanel
      selectAnnotation(id, false);
    };

    /**
     * Apply deletion to the viewer when requested in the context
     * Compare annotation in viewer and in db 
     * Remove from viewer the annotations which does not appear in db
     */
    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) return;
      const viewer = ref.current;
      const annotationManager = viewer.getAnnotationManager();
      if (!annotationManager) return;

      const ids = annotations.map((a) => a.id);

      const viewerAnnotations = annotationManager.getAnnotations();
      const viewerAnnotationIds = viewerAnnotations.map((a: { id: string }) => a.id);

      const deletedIds = viewerAnnotationIds.filter((id: string) => !ids.includes(id));
      deletedIds.forEach((id: string) => {
        console.log('Removing deleted annotation from viewer:', id);
        annotationManager.deleteAnnotation(id);
      });
    }, [annotations, ref]);

    useEffect(() => {
      // Update draw in the viewer when annotationPanel updates the selection 
      // set annotation on openlimeviewer
      if (!ref || !('current' in ref) || !ref.current) return;
      const viewer = ref.current;
      const annotationManager = viewer.getAnnotationManager();
      if (!annotationManager) return;
      if (selectedAnnotationIds.length > 0) {
        // Increment the counter by the number of setSelected calls we are about to make.
        // Each call causes OpenLIME to echo an onSelect event; the counter tracks how many
        // echoes to suppress so handleAnnotationSelected does not overwrite the multi-selection.
        isProgrammaticSelectionRef.current += selectedAnnotationIds.length;
        selectedAnnotationIds.forEach(id => {
          annotationManager.setSelected(id, true);
        });
      }
    }, [selectedAnnotationIds, ref]);

    return (
      <OpenLIMEViewer
        ref={ref}
        sceneDesc={sceneDesc}
        digitalAssets={digitalAssets}
        onReady={onReady}
        onError={onError}
        onAnnotationCreated={handleAnnotationCreated}
        onAnnotationUpdated={handleAnnotationUpdated}
        onAnnotationDeleted={handleAnnotationDeleted}
        onAnnotationSelected={handleAnnotationSelected}
      />
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
