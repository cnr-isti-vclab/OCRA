import { forwardRef, useEffect, useRef } from 'react';
import OpenLIMEViewer, { type OpenLIMEViewerRef, type SimplifiedAnnotation } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { SceneDescription, ViewerAnnotation } from '../../../../shared/scene-types';
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
    const { createAnnotation, updateAnnotationGeometry, setSelectedAnnotationIds, selectedAnnotationIds, annotations } = useAnnotations();

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
    const handleAnnotationCreated = (anno: ViewerAnnotation) => {
      createAnnotation(anno);
    };

    // Handle forward annotation update from viewer to context, then to the annotationPanel
    const handleAnnotationUpdated = (anno: ViewerAnnotation) => {
      updateAnnotationGeometry(anno.id, anno.geometry);
    };

    // Handle forward annotation deletion from viewer to context, then to the annotationPanel
    const handleAnnotationDeleted = (anno: ViewerAnnotation) => {
      // Annotation deletion is handled through AnnotationPanel's delete button
      // When viewer wants to delete, it should go through the same path
    };

    // Handle annotation selection change from the viewer → context → AnnotationPanel.
    // OpenLIME fires this with the full current selection (may be empty = deselect all).
    const handleAnnotationSelectionChange = (ids: string[]) => {
      // If the selection was pushed programmatically (context → viewer), OpenLIME still
      // fires onSelectionChange for its own visual update — ignore that echo to avoid a loop.
      if (isProgrammaticSelectionRef.current > 0) {
        isProgrammaticSelectionRef.current--;
        return;
      }
      // Replace the whole selection at once (handles empty array = clear selection)
      setSelectedAnnotationIds(ids);
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

      // Skip deletion sync while a drawing session is in progress.
      // When the backend PUT resolves after finalizing one annotation, React
      // re-renders and this effect would see the in-progress annotation (already
      // pushed to layer.annotations by _startSession) as "deleted from context",
      // calling deleteAnnotation() and removing its SVG elements — including the
      // vertex-handle dots — from the DOM.
      if (annotationManager.mode === 'create') return;

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
      // Panel → viewer: sync selectedAnnotationIds into the OpenLIME annotation manager.
      if (!ref || !('current' in ref) || !ref.current) return;
      const viewer = ref.current;
      const annotationManager = viewer.getAnnotationManager();
      if (!annotationManager) return;

      // Each programmatic call below will echo an onSelectionChange event from OpenLIME.
      // We suppress exactly those echoes: 1 for deselectAll + 1 per setSelected call.
      const echoCount = 1 + selectedAnnotationIds.length;
      isProgrammaticSelectionRef.current += echoCount;

      // Clear existing selection, then apply the context selection.
      annotationManager.deselectAll();
      selectedAnnotationIds.forEach(id => {
        annotationManager.setSelected(id, true);
      });
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
        onAnnotationSelectionChanged={handleAnnotationSelectionChange}
      />
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
