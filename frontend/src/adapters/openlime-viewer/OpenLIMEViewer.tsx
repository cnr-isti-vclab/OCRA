// ## Installing OpenLIME during development using npm link
// By default, this viewer uses the OpenLIME package installed from npm. 
// If you are developing OpenLIME locally or working with a custom build, you can
// link it into this application using npm link.

// Inside your OpenLIME project:
//     `npm run rollup`
//     `npm run build-types`
//     `sudo npm link`

// Then inside this React viewer project:
//     `npm link openlime`

// This makes the local OpenLIME package available as if it were installed from
// npm, allowing rapid iteration without publishing.


import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as OpenLIME from 'openlime';
import type { DigitalAsset } from '../../routes/HDTPage.tsx';
import './skin.css';
import { SceneDescription } from '../../lib/ThreePresenter/src';

export interface OpenLIMEViewerRef {
  // Put Here API methods you want to expose to parent components, e.g.:
  resetCamera: () => void;
}

const OpenLIMEViewer = forwardRef<
  OpenLIMEViewerRef,
  {
    sceneDesc: SceneDescription, 
    digitalAssets: DigitalAsset[],
    onReady?: () => void;
    onError?: (error: Error) => void;
  } >(
  (
    { sceneDesc, digitalAssets, onReady, onError },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<OpenLIME.Viewer | null>(null);
    const uiRef = useRef<OpenLIME.UIBasic | null>(null);

    // Initialize viewer on mount
    useEffect(() => {
      if (!mountRef.current) return;

      const resize = () => {
        if (viewerRef.current && mountRef.current) {
          viewerRef.current.resize(
            mountRef.current.clientWidth,
            mountRef.current.clientHeight
          );
          console.log('✅ OpenLIME resized to', mountRef.current.clientWidth, 'x', mountRef.current.clientHeight  );
          viewerRef.current.redraw();
        } else {
          console.warn('⚠️ Cannot resize OpenLIME Viewer: viewer or mount element not available');
        }
      };

      window.addEventListener('resize', resize);

      try {
        console.log('🎬 Initializing OpenLIME Viewer with scene:', sceneDesc);

        const viewer = new OpenLIME.Viewer(mountRef.current);

        if (viewer === null) {
          throw new Error('Failed to initialize OpenLIME Viewer');
        }

        viewerRef.current = viewer;

        resize();
        viewer.redraw();
        console.log('✅ OpenLIME Viewer initialized successfully');
       
        // Setup Interface and skin
        OpenLIME.Skin.setUrl('/skin.svg');
        console.log('🎬 Loaded OpenLIME skin from ./skin.svg');


        if (onReady) {
          onReady();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('❌ Failed to initialize OpenLIME Viewer:', err);
        if (onError) {
          onError(err);
        }
      }

      return () => {
        console.log('🛑 Disposing OpenLIME Viewer');
        if (viewerRef.current) {
          window.removeEventListener('resize', resize);
          viewerRef.current.dispose?.();
          viewerRef.current = null;
        }
      };
    }, [onReady, onError]);

    //const loadScene = (sceneDesc: SceneDescription, digitalAssets: DigitalAsset[]) => {
    useEffect(() => {
      console.log("Loading scene into OpenLIME Viewer with description:", sceneDesc);
      if (viewerRef.current === null) {
        console.warn('⚠️ Cannot load scene: OpenLIME Viewer not initialized');
        return;
      }
      if (digitalAssets.length === 0  ) {
        console.warn('⚠️ Cannot load scene: No digital assets provided');
        return;
      }

      const viewer = viewerRef.current;
      viewer.clearLayers();

      // For simplicity, we assume a single layer with all assets. In a real implementation, you might want to support multiple layers and different layouts.
      const layerType = 'rti';   // FIXME parameterize this based on asset type or scene description
      const layout = 'deepzoom'; // FIXME parameterize this based on asset type or scene description

      digitalAssets.forEach((asset) => {
        if (asset.type === 'rti') {
          const url = asset.entryPointUrl; // Assuming the URL is directly usable by OpenLIME
          const layer = new OpenLIME.Layer({
            label: layerType,
            url: url,
            layout: layout,
            type: layerType,
            normals: false,
            visible: true,
          });
          viewer.addLayer(layerType, layer);
          console.log(`🎬 Added asset to OpenLIME Viewer: ${asset.fileName} (${url})`);
        }
      });

      console.log("Create new OpenLIME.UIBasic");
      uiRef.current = new OpenLIME.UIBasic(viewer, {
        showLightDirections: true,
      });
      uiRef.current.actions.zoomin.display = true;
      uiRef.current.actions.zoomout.display = true;
      uiRef.current.actions.light.active = true;
       
      viewer.redraw();
      console.log('✅ OpenLIME scene loaded successfully');
    }, [sceneDesc, viewerRef.current]);

    // Expose resize method to parent component
    useImperativeHandle(ref, () => ({
      // Put Here API methods (same as in OpenLIMEViewerRef) you want to expose to parent components, e.g.:
      // loadScene: (sceneDesc: SceneDescription, digitalAssets: DigitalAsset[]) => {
      //   loadScene(sceneDesc, digitalAssets);
      // }
      resetCamera() {
        if (viewerRef.current != null) {
          viewerRef.current.camera.reset();
        }
      }
    }));

    return (
      <div className='openlime-container'
        ref={mountRef}
        style={{
          position: 'relative',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#404040',
        }}
      />
    );
  }
);

OpenLIMEViewer.displayName = 'OpenLIMEViewer';

export default OpenLIMEViewer;
