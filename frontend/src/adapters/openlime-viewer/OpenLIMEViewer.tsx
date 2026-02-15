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
    const onReadyRef = useRef<typeof onReady>(onReady);
    const onErrorRef = useRef<typeof onError>(onError);

    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      onErrorRef.current = onError;
    }, [onError]);

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


        if (onReadyRef.current) {
          onReadyRef.current();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('❌ Failed to initialize OpenLIME Viewer:', err);
        if (onErrorRef.current) {
          onErrorRef.current(err);
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
    }, []);

    //const loadScene = (sceneDesc: SceneDescription, digitalAssets: DigitalAsset[]) => {
    useEffect(() => {
      let cancelled = false;

      const loadScene = async () => {
        console.log("Loading scene into OpenLIME Viewer with description:", sceneDesc);
        if (viewerRef.current === null) {
          console.warn('⚠️ Cannot load scene: OpenLIME Viewer not initialized');
          return;
        }
        if (digitalAssets.length === 0) {
          console.warn('⚠️ Cannot load scene: No digital assets provided');
          return;
        }

        const viewer = viewerRef.current;
        viewer.clearLayers();

        const layerType = 'rti';   // FIXME parameterize this based on asset type or scene description
        const layout = 'deepzoom'; // FIXME parameterize this based on asset type or scene description

        let scalePixelSize: number | null = null;

        for (let i = 0; i < digitalAssets.length; i++) {
          const asset = digitalAssets[i];
          if (asset.type !== 'rti') continue;

          const url = asset.entryPointUrl;
          if (!url) continue;

          let pixelSizeInMM: number | null = null;
          try {
            const response = await fetch(url);
            if (response.ok) {
              const info = await response.json();
              const parsed = Number(info?.pixelSizeInMM);
              if (Number.isFinite(parsed) && parsed > 0) {
                pixelSizeInMM = parsed;
                if (scalePixelSize == null) {
                  scalePixelSize = parsed;
                }
              }
            }
          } catch (error) {
            console.warn(`⚠️ Could not read pixelSizeInMM from ${url}:`, error);
          }

          if (cancelled) return;

          const layerId = asset.id || `${layerType}-${i}`;
          const layerOptions: any = {
            label: asset.fileName || layerType,
            url,
            layout,
            type: layerType,
            normals: false,
            visible: true,
          };
          if (pixelSizeInMM != null) {
            layerOptions.pixelSize = pixelSizeInMM;
          }

          const layer = new OpenLIME.Layer(layerOptions);
          viewer.addLayer(layerId, layer);
          console.log(`🎬 Added asset to OpenLIME Viewer: ${asset.fileName} (${url}), pixelSizeInMM=${pixelSizeInMM ?? 'n/a'}`);
        }

        if (cancelled) return;

        if (!uiRef.current) {
          console.log("Create new OpenLIME.UIBasic");
          uiRef.current = new OpenLIME.UIBasic(viewer, {
            showLightDirections: true,
            pixelSize: scalePixelSize ?? undefined,
          });
        } else if (scalePixelSize != null) {
          const uiAny = uiRef.current as any;
          uiAny.pixelSize = scalePixelSize;
          if (uiAny.scalebar) {
            uiAny.scalebar.pixelSize = scalePixelSize;
          } else if ((OpenLIME as any).ScaleBar) {
            uiAny.scalebar = new (OpenLIME as any).ScaleBar(scalePixelSize, viewer);
          }
        }

        if (uiRef.current) {
          uiRef.current.actions.zoomin.display = true;
          uiRef.current.actions.zoomout.display = true;
          uiRef.current.actions.light.active = true;
        }

        viewer.redraw();
        console.log('✅ OpenLIME scene loaded successfully');
      };

      void loadScene();
      return () => {
        cancelled = true;
      };
    }, [sceneDesc, digitalAssets]);

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
      <div className='openlime openlime-container'
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
