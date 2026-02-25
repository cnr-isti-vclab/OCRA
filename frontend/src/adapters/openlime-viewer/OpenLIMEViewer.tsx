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
import { Annotation } from '../../../../shared/scene-types.ts';
//import { on } from 'events';

/**
 * Simplified annotation interface for CRUD operations
 */
export interface SimplifiedAnnotation {
  id: string;
  label?: string;
  description?: string;
  class?: string;
  data?: any;
  publish?: number;
  state?: any;
}

function getOcraAnnotation(anno : SimplifiedAnnotation) : Annotation {
  const ocraAnno : Annotation =  {
    id: anno.id || `anno-${Date.now()}`,
    label: anno.label || 'New Annotation 2D',
    type: 'point',
    geometry: [anno.data?._x || 0, anno.data?._y || 0, 0],
    createdAt: new Date().toISOString(),
    description: anno.description,
    createdBy: 'User to be defined'
  };
  return ocraAnno;
}

export interface OpenLIMEViewerRef {
  // Camera controls
  resetCamera: () => void;
  
  // Annotation CRUD operations
  getAllAnnotations: () => SimplifiedAnnotation[];
  getAnnotationById: (id: string) => SimplifiedAnnotation | null;
  updateAnnotationById: (id: string, updates: Partial<SimplifiedAnnotation>) => SimplifiedAnnotation | null;
  deleteAnnotationById: (id: string) => SimplifiedAnnotation | null;

  getAnnotationManager: () => OpenLIME.ManagerSvgAnnotation | null;

}


const OpenLIMEViewer = forwardRef<
  OpenLIMEViewerRef,
  {
    sceneDesc: SceneDescription, 
    digitalAssets: DigitalAsset[],
    onReady?: () => void;
    onError?: (error: Error) => void;
    // Annotation callbacks
    onAnnotationCreated?: (annotation: Annotation) => void;
    onAnnotationUpdated?: (annotation: Annotation) => void;
    onAnnotationDeleted?: (annotation: Annotation) => void;
    onAnnotationSelected?: (id: string) => void;
  } >(
  (
    { sceneDesc, digitalAssets, onReady, onError, onAnnotationCreated, onAnnotationUpdated, onAnnotationDeleted, onAnnotationSelected },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const viewerRef = useRef<OpenLIME.Viewer | null>(null);
    const uiRef = useRef<OpenLIME.UIBasic | null>(null);
    const annotationManagerRef = useRef<OpenLIME.ManagerSvgAnnotation>(null);
    const onReadyRef = useRef<typeof onReady>(onReady);
    const onErrorRef = useRef<typeof onError>(onError);
    const onAnnotationCreatedRef = useRef<typeof onAnnotationCreated>(onAnnotationCreated);
    const onAnnotationUpdatedRef = useRef<typeof onAnnotationUpdated>(onAnnotationUpdated);
    const onAnnotationDeletedRef = useRef<typeof onAnnotationDeleted>(onAnnotationDeleted);
    const onAnnotationSelectedRef = useRef<typeof onAnnotationSelected>(onAnnotationSelected);
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      onErrorRef.current = onError;
    }, [onError]);

    useEffect(() => {
      onAnnotationCreatedRef.current = onAnnotationCreated;
    }, [onAnnotationCreated]);

    useEffect(() => {
      onAnnotationUpdatedRef.current = onAnnotationUpdated;
    }, [onAnnotationUpdated]);

    useEffect(() => {
      onAnnotationDeletedRef.current = onAnnotationDeleted;
    }, [onAnnotationDeleted]);

    useEffect(() => {
      onAnnotationSelectedRef.current = onAnnotationSelected;
    }, [onAnnotationSelected]);

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

        const getMatrix = (model: SceneDescription['models'][number]) => {
          console.log(`Calculating transformation matrix for model ${model.id} with properties:`, model);
          const scale = model.scale || 1;
          const pos = model.position || [0, 0, 0];
          const rotScale = (model.rotationUnits && model.rotationUnits === 'rad') ?  180 / Math.PI : 1;
          const rot = model.rotation ? model.rotation[2] * rotScale : 0;

          let t = new OpenLIME.Transform(); 
          t.x = pos[0];
          t.y = pos[1];
          t.a = rot;
          t.sx = scale;
          t.sy = scale;
          t.t = 0;
          //
          t.print();
          return t;
        };
        
        const viewer = viewerRef.current;
        viewer.clearLayers();

       
        let scalePixelSize: number | null = null;

        // FIXME HOW TO HANDLE DIFFERENT PIXEL SIZES ACROSS LAYERS? SHOULD WE ENFORCE A SINGLE SCALE FOR THE WHOLE SCENE, OR ALLOW PER-LAYER SCALES?

        // Find all the RTI models in the scene description and add them to the viewer, 
        // while keeping track of their corresponding digital assets and transformation matrices
        let selectedAssets: number[] = [];
        let matrices: OpenLIME.Transform[] = [];
        let urls: string[] = [];
        sceneDesc.models.forEach((model) => {
          const assetId = model.id;
          const foundIndex = digitalAssets.findIndex(a => a.id === assetId);
          if (foundIndex != -1) {
            const asset = digitalAssets[foundIndex];
            if (asset.entryPointUrl != null && asset.type === 'rti') {
              selectedAssets.push(foundIndex);
              matrices.push(getMatrix(model));
              urls.push(asset.entryPointUrl);
              console.log(`🎬 Prepared asset for OpenLIME Viewer: ${asset.fileName} (ID: ${asset.id}), URL: ${asset.entryPointUrl}`);
            } else {
              console.warn(`⚠️ Skipping asset ${asset.fileName} (ID: ${asset.id}): missing entryPointUrl or unsupported type (${asset.type})`);
            }
          } else {
            console.warn(`⚠️ No matching digital asset found for model ID: ${assetId}`);
          }
        });
          
        // Iterate over the selected assets and add them to the viewer with their corresponding transformation matrices, 
        // while also attempting to read pixel size information from the asset's entry point URL if available
        for (let i = 0; i < selectedAssets.length; i++) {
          const asset = digitalAssets[selectedAssets[i]];
          const matrix = matrices[i];
          const url = urls[i];
          console.log(`🎬 Adding asset to OpenLIME Viewer: ${asset.fileName}, ${url}, matrix `, matrix);

          // Read Header data if available
          let pixelSizeInMM: number | null = null;
          let layerType = 'rti';   // FIXME parameterize this based on asset type or scene description
          let layout = 'deepzoom'; // FIXME parameterize this based on asset type or scene description
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

                //layerType = info?.type || layerType;
                layout = info?.layout || layout;

                console.log(`🎬 Read header info from ${url}: pixelSizeInMM=${pixelSizeInMM}, type=${layerType}, layout=${layout}`);
              }

            } catch (error) {
              console.warn(`⚠️ Could not read pixelSizeInMM from ${url}:`, error);
            }

          if (cancelled) return;

          // Add layer to viewer with appropriate options, including transformation matrix and pixel size if available
          const layerId = asset.id || `${layerType}-${i}`;
          const layerOptions: any = {
            label: asset.fileName || layerType,
            url,
            layout,
            type: 'rti',
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
        //////////////////////////////////////

        if (cancelled) return;

        // Setup annotation manager
        console.log('🎬 Setting up OpenLIME annotation manager');
        const annotationManager = new OpenLIME.ManagerSvgAnnotation(viewer, {        
          activeMarker: 'disk',
            markerOptions: { radius: 14 },
            // Colour classes — annotation.class (0/1/2) selects the style
            classes: [
                { label: 'Disk',     fill: '#3942e6', stroke: '#e63946', fillOpacity: 0.75, strokeWidth: 2, fillSelected: '#ffd700', strokeSelected: '#ffd700' },
                { label: 'Polyline', fill: 'none',    stroke: '#00aaff', fillOpacity: 1,    strokeWidth: 2, fillSelected: 'none',    strokeSelected: '#ffd700' },
                { label: 'Polygon',  fill: 'rgba(34,187,85,0.2)', stroke: '#22bb55', fillOpacity: 1, strokeWidth: 2, fillSelected: 'rgba(255,215,0,0.15)', strokeSelected: '#ffd700' },
            ],
            defaultAnnotationClass: 0,
            // Capture viewer state (light direction, render mode, …) in each annotation
            enableState: true,

            // Called whenever a new annotation is created
            onCreate: (anno:SimplifiedAnnotation) => {
              if (onAnnotationCreatedRef.current) {
                console.log('OpenLIMEViewerRef:onCreate Annotation', anno);
                onAnnotationCreatedRef.current(getOcraAnnotation(anno));
              } else {
                console.log('OpenLIMEViewerRef:onCreate Missing Annotation Callback', anno);
              }
            },
  
            onDelete: (anno:SimplifiedAnnotation) => {
              if (onAnnotationDeletedRef.current) {
                console.log('OpenLIMEViewerRef:onDelete Annotation', anno);
                onAnnotationDeletedRef.current(getOcraAnnotation(anno));
              } else {
                console.log('OpenLIMEViewerRef:onDelete Missing Annotation Callback', anno);
              }
            },

            onUpdate: (anno:SimplifiedAnnotation) => {
              if (onAnnotationUpdatedRef.current) {
                console.log('OpenLIMEViewerRef:onUpdate Annotation', anno);
                const ocraAnno = getOcraAnnotation(anno);
                console.log('Update',ocraAnno);
                onAnnotationUpdatedRef.current(ocraAnno);
              } else {
                console.log('OpenLIMEViewerRef:onUpdate Missing Annotation Callback', anno);
              }
            },

            // Called when the user selects an annotation by clicking on it
            onSelect: (anno:SimplifiedAnnotation) => {
              console.log('🖱️ OpenLIMEViewerRef Selected (single-click)', anno.id);
              if (onAnnotationSelectedRef.current) {
                console.log('🖱️ Firing onSelect callback for:', anno.id);
                onAnnotationSelectedRef.current(anno.id);
              } else {
                console.log('🖱️ onSelect Missing Annotation Callback');
              }

            },


            // Lock toolbar and show creation hint during sequence creation
            onSessionStart: (anno:SimplifiedAnnotation) => {

            },
            onSessionCancel: () => {

            },

        });
        annotationManagerRef.current = annotationManager;

        // After all layers are added, setup the UI and annotation callbacks
        if (!uiRef.current) {
          console.log("Create new OpenLIME.UIBasic");
          uiRef.current = new OpenLIME.UIBasic(viewer, {
            showLightDirections: true,
            pixelSize: scalePixelSize ?? undefined,
            annotationManager: annotationManagerRef.current,
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
          // Show pencil tool but don't activate it by default
          // This allows single-click selection to work
          uiRef.current.actions.pencil.display = true;
          console.log('🎬 Toolbar setup: pencil displayed');
          
          // Set annotation manager to edit mode for single-click selection to work
          // When pencil tool is activated, it will switch to create mode
          if (annotationManagerRef.current) {
            console.log('🎬 Setting annotation manager to edit mode for selection');
            annotationManagerRef.current.setMode('edit');
            console.log('AnnotationManager mode (should be edit)', annotationManagerRef.current._mode);
          }
          
          // When pencil mode is activated, deselect all annotations
          uiRef.current.addEvent('pencilEnabled', () => {
            console.log('🎬 Pencil tool activated - deselecting all annotations');
            if (annotationManagerRef.current) {
              annotationManagerRef.current.deselectAll();
              console.log('AnnotationManager Deselect all');

            }
          });

          uiRef.current.addEvent('pencilDisabled', () => {
            console.log('🎬 Pencil tool deactivatedù');
          });

          document.addEventListener('keydown', (e:KeyboardEvent) => {
            console.log('Pressed', e.key);
            if (e.key==='e') {
                 annotationManagerRef.current.setMode('edit');
            } else if (e.key==='c') {
                 annotationManagerRef.current.setMode('create');
            } else if (e.key==='i') {
                 annotationManagerRef.current.setMode('idle');
            } else {
              console.log('unsupported mode', e.key);
            }
          });
          
        }

        // Setup event listeners for annotation layer events (update, delete)
        //setupAnnotationLayerListeners();

        viewer.redraw();
        console.log('✅ OpenLIME scene loaded successfully');
      };

      void loadScene();
      return () => {
        cancelled = true;
      };
    }, [sceneDesc, digitalAssets]);

    // Helper function to get annotation layer
    const getAnnotationLayer = () => {
      if (!annotationManagerRef.current) return null;
      if (!annotationManagerRef.current.layer) return null;
      return annotationManagerRef.current.layer;
    };

    // Helper function to serialize annotation for external use
    const serializeAnnotation = (anno: any): SimplifiedAnnotation => {
      return {
        id: anno.id,
        label: anno.label,
        description: anno.description,
        class: anno.class,
        data: anno.data,
        publish: anno.publish,
        state: anno.state,
      };
    };

        // Setup listeners on annotation layer for update/delete events
        // const setupAnnotationLayerListeners = () => {
        //   const attachListeners = (layer: any) => {
        //     // Listen for updated events
        //     layer.on('updated', (anno: any) => {
        //       console.log('Annotation updated:', anno);
        //       try {
        //         const cb = onAnnotationUpdatedRef.current;
        //         console.log('layer.updated: callback type=', typeof cb, 'name=', (cb as any)?.name);
        //         if (typeof cb === 'function') {
        //           Promise.resolve().then(() => cb(serializeAnnotation(anno))).catch((err) => {
        //             console.error('layer.updated callback threw', err);
        //           });
        //         }
        //       } catch (err) {
        //         console.error('onAnnotationUpdated callback threw', err);
        //       }
        //     });

        //     // Listen for deleted events
        //     layer.on('deleted', (anno: any) => {
        //       console.log('Annotation deleted:', anno);
        //       try {
        //         const cb = onAnnotationDeletedRef.current;
        //         console.log('layer.deleted: callback type=', typeof cb, 'name=', (cb as any)?.name);
        //         if (typeof cb === 'function') {
        //           Promise.resolve().then(() => cb(serializeAnnotation(anno))).catch((err) => {
        //             console.error('layer.deleted callback threw', err);
        //           });
        //         }
        //       } catch (err) {
        //         console.error('onAnnotationDeleted callback threw', err);
        //       }
        //     });

        //     console.log('✅ Annotation layer event listeners setup');
        //   };

        //   const tryAttach = (attempt = 0) => {
        //     const layer = getAnnotationLayer();
        //     if (layer) {
        //       attachListeners(layer);
        //       return;
        //     }
        //     if (attempt < 6) {
        //       // retry a few times while UI initializes
        //       setTimeout(() => tryAttach(attempt + 1), 200);
        //     } else {
        //       console.warn('⚠️ Cannot setup annotation listeners: no annotation layer found after retries');
        //     }
        //   };

        //   tryAttach(0);
        // };

    // Expose CRUD methods to parent component
    useImperativeHandle(ref, () => ({
      resetCamera() {
        if (viewerRef.current != null) {
          viewerRef.current.camera.reset();
        }
      },

      getAllAnnotations(): SimplifiedAnnotation[] {
        const layer = getAnnotationLayer();
        if (!layer || typeof layer.listAnnotations !== 'function') {
          console.warn('⚠️ Cannot get annotations: no annotation layer or method not available');
          return [];
        }
        const annotations = layer.listAnnotations(true);
        return annotations.map(serializeAnnotation);
      },

      getAnnotationById(id: string): SimplifiedAnnotation | null {
        const layer = getAnnotationLayer();
        if (!layer || typeof layer.getAnnotationById !== 'function') {
          console.warn('⚠️ Cannot get annotation: no annotation layer or method not available');
          return null;
        }
        const anno = layer.getAnnotationById(id);
        return anno ? serializeAnnotation(anno) : null;
      },

      updateAnnotationById(id: string, updates: Partial<SimplifiedAnnotation>): SimplifiedAnnotation | null {
        const layer = getAnnotationLayer();
        if (!layer || typeof layer.updateAnnotationById !== 'function') {
          console.warn('⚠️ Cannot update annotation: no annotation layer or method not available');
          return null;
        }
        console.log(`Updating annotation ${id} with:`, updates);
        const updatedAnno = layer.updateAnnotationById(id, updates);
        if (updatedAnno && viewerRef.current) {
          viewerRef.current.redraw();
        }
        return updatedAnno ? serializeAnnotation(updatedAnno) : null;
      },

      deleteAnnotationById(id: string): SimplifiedAnnotation | null {
        console.log('Delete annotation by id');
        console.log(id);
        const layer = getAnnotationLayer();
        if (!layer || typeof layer.deleteAnnotationById !== 'function') {
          console.warn('⚠️ Cannot delete annotation: no annotation layer or method not available');
          return null;
        }
        console.log(`Deleting annotation ${id}`);
        const deletedAnno = layer.deleteAnnotationById(id);
        if (deletedAnno && viewerRef.current) {
          viewerRef.current.redraw();
        }
        return deletedAnno ? serializeAnnotation(deletedAnno) : null;
      },

      getAnnotationManager() {
        return annotationManagerRef.current;
      },
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
