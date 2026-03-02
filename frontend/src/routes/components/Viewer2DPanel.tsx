import { forwardRef, useEffect } from 'react';
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

    const handleAnnotationCreated = (anno: Annotation) => {
      console.log('Viewer2DPanel::handleAnnotationCreated', anno);
      createAnnotation(anno);
    };

    const handleAnnotationUpdated = (anno: Annotation) => {
      console.log('Viewer2DPanel::handleAnnotationUpdated', anno);
      updateAnnotationGeometry(anno.id, anno.geometry);
    };

    const handleAnnotationDeleted = (anno: Annotation) => {
      // Annotation deletion is handled through AnnotationPanel's delete button
      // When viewer wants to delete, it should go through the same path
      console.log('Annotation deletion from 2D viewer:', anno.id);
    };

    const handleAnnotationSelected = (id: string) => {
      console.log('Viewer2DPanel::handleAnnotationSelected, id', id);
      selectAnnotation(id, false);
    };

    /**
     * Apply deletion to the viewer
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
      const viewerAnnotationIds = viewerAnnotations.map((a) => a.id);

      const deletedIds = viewerAnnotationIds.filter((id) => !ids.includes(id));
      deletedIds.forEach((id) => {
        console.log('Removing deleted annotation from viewer:', id);
        annotationManager.deleteAnnotation(id);
      });

      // annotations.forEach((anno) => {
      //   // Update or delete annotations in the viewer, from the DB annotations
      //   let foundViewerAnno = viewerAnnotations.find((element) => {element.id == anno.id});
      //   if (foundViewerAnno) {
      //     if (anno === foundViewerAnno) {
      //       // Same, nothing to do
      //     } else {
      //       // Different, Update Viewer version
      //       console.log('I should update viewr Annotation', foundViewerAnno, " to become ", anno);
      //     }
      //   } else {
      //     // Missing in 
      //     annotationManager.deleteAnnotation(anno.id);
      //   }
      // });
    }, [annotations, ref]);

    useEffect(() => {

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
