import { forwardRef } from 'react';
import OpenLIMEViewer, { type OpenLIMEViewerRef, type SimplifiedAnnotation } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { SceneDescription, Annotation } from '../../../../shared/scene-types';
import { DigitalAsset } from '../HDTPage';

interface Viewer2DPanelProps {
  sceneDesc: SceneDescription | null;
  digitalAssets: DigitalAsset[];
  rtiAvailable: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
  onAnnotationCreated?: (annotation: Annotation) => void;
  onAnnotationUpdated?: (annotation: Annotation) => void;
  onAnnotationDeleted?: (id: string) => void;
}

/**
 * Component that encapsulates the 2D (RTI) viewer
 */
const Viewer2DPanel = forwardRef<OpenLIMEViewerRef, Viewer2DPanelProps>(
  ({ sceneDesc, digitalAssets, rtiAvailable, onReady, onError, onAnnotationCreated, onAnnotationUpdated, onAnnotationDeleted }, ref) => {
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

    const handleAnnotationCreated = (anno: SimplifiedAnnotation) => {
      const ocraAnno: Annotation = {
        id: anno.id || `anno-${Date.now()}`,
        label: anno.label || 'New Annotation 2D',
        type: 'point',
        geometry: [anno.data?.pos.x || 0, anno.data?.pos.y || 0, 0],
        createdAt: new Date().toISOString()
      };
      
      if (onAnnotationCreated) {
        onAnnotationCreated(ocraAnno);
      }
    };

    const handleAnnotationUpdated = (anno: SimplifiedAnnotation) => {
      const ocraAnno: Annotation = {
        id: anno.id,
        label: anno.label || 'Updated Annotation 2D',
        type: 'point',
        geometry: [anno.data?.pos.x || 0, anno.data?.pos.y || 0, 0],
        createdAt: new Date().toISOString()
      };
      
      if (onAnnotationUpdated) {
        onAnnotationUpdated(ocraAnno);
      }
    }

    const handleAnnotationDeleted = (anno: SimplifiedAnnotation) => {
      if (onAnnotationDeleted) {
        onAnnotationDeleted(anno.id);
      }
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
        onAnnotationDeleted={handleAnnotationDeleted}
      />
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
