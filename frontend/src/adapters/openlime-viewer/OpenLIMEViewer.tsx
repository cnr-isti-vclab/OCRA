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


import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import * as OpenLIME from 'openlime';
import type { DigitalAsset } from '../../routes/HDTPage.tsx';
import './openlime-skin-ocra.css'; // custo skin.css for OCRA
import { ViewerAnnotation, ViewerAnnotationShapeType, ViewerAnnotationGeometry, SceneDescription } from '../../../../shared/scene-types.ts';

/**
 * Simplified annotation interface for CRUD operations
 */
export interface SimplifiedAnnotation {
  id: string;
  label?: string;
  class?: string;
  data?: any;
  type?: string;
  publish?: number;
  state?: any;
}

function getOcraAnnotation(anno: SimplifiedAnnotation): ViewerAnnotation {
  console.log('Converting SimplifiedAnnotation to OCRA Annotation:', anno);
  let annoType: ViewerAnnotationShapeType = 'point';
  let geometry: ViewerAnnotationGeometry = ([]);

  // OpenLIME's ManagerSvgAnnotation uses `annotation.type = 'point'` for disk annotations,
  // while the actual marker is stored in `data._markerType = 'disk'`.
  // Prefer marker type when present, and treat 'point' as a disk.
  const markerType = anno.data?._markerType ?? anno.type;

  const markerClosed = Boolean(anno.data?._markerClosed);

  if (markerType === 'disk' || markerType === 'point') {
    annoType = 'point';
    geometry = [anno.data?._x || 0, anno.data?._y || 0, 0];
  } else if (markerType === 'polyline') {
    // OpenLIME uses markerType 'polyline' for both open polylines and closed polygons.
    // Closed-ness is stored in `data._markerClosed` (and may also appear as anno.type === 'polygon').
    annoType = markerClosed || anno.type === 'polygon' ? 'area' : 'line';
    geometry = anno.data?._markerPoints.map((point: any) => [point.x, point.y, 0]);
  } else if (markerType === 'polygon') {
    annoType = 'area';
    geometry = anno.data?._markerPoints.map((point: any) => [point.x, point.y, 0]);
  } else if (markerType === 'rect') {
    annoType = 'area';
    //geometry = anno.data?._markerCorners.map((point: any) => [point.x, point.y, 0]);
    // Convert the two markerCorners into 4 explicit points
    geometry = [];
    geometry.push([anno.data?._markerCorners[0].x, anno.data?._markerCorners[0].y, 0]);
    geometry.push([anno.data?._markerCorners[1].x, anno.data?._markerCorners[0].y, 0]);
    geometry.push([anno.data?._markerCorners[1].x, anno.data?._markerCorners[1].y, 0]);
    geometry.push([anno.data?._markerCorners[0].x, anno.data?._markerCorners[1].y, 0]);
  } else if (markerType === 'freehand') {
    annoType = 'line';
    geometry = anno.data?._markerPoints.map((point: any) => [point.x, point.y, 0]);
  } else {
    console.log('Unknown annotation type:', anno.type, 'markerType:', markerType);
  }

  if (geometry.length === 0) {
    geometry = [anno.data?._x || 0, anno.data?._y || 0, 0];
  }
  // console.log('Data:', anno.data);
  // console.log('Type:', anno.type);
  // console.log('MarkerPoints:', anno.data?._markerPoints);
  // console.log('Extracted geometry:', geometry);

  const ocraAnno: ViewerAnnotation = {
    id: anno.id || `anno-${Date.now()}`,
    label: anno.label || 'New ' + anno.type + ' annotation',
    type: annoType,
    geometry: geometry,
    createdAt: new Date().toISOString(),
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
    onAnnotationCreated?: (annotation: ViewerAnnotation) => void;
    onAnnotationUpdated?: (annotation: ViewerAnnotation) => void;
    onAnnotationDeleted?: (annotation: ViewerAnnotation) => void;
    onAnnotationSelectionChanged?: (ids: string[]) => void;
  }>(
    (
      { sceneDesc, digitalAssets, onReady, onError, onAnnotationCreated, onAnnotationUpdated, onAnnotationDeleted, onAnnotationSelectionChanged },
      ref
    ) => {
      const [isEditing, setIsEditing] = useState(false);
      const [activeAnnotationClass, setActiveAnnotationClass] = useState<number>(0);
      const mountRef = useRef<HTMLDivElement | null>(null);
      const viewerRef = useRef<OpenLIME.Viewer | null>(null);
      const uiRef = useRef<OpenLIME.UIBasic | null>(null);
      const annotationManagerRef = useRef<OpenLIME.ManagerSvgAnnotation>(null);
      const onReadyRef = useRef<typeof onReady>(onReady);
      const onErrorRef = useRef<typeof onError>(onError);
      const onAnnotationCreatedRef = useRef<typeof onAnnotationCreated>(onAnnotationCreated);
      const onAnnotationUpdatedRef = useRef<typeof onAnnotationUpdated>(onAnnotationUpdated);
      const onAnnotationDeletedRef = useRef<typeof onAnnotationDeleted>(onAnnotationDeleted);
      const onAnnotationSelectionChangedRef = useRef<typeof onAnnotationSelectionChanged>(onAnnotationSelectionChanged);
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
        onAnnotationSelectionChangedRef.current = onAnnotationSelectionChanged;
      }, [onAnnotationSelectionChanged]);

      // Initialize viewer on mount
      useEffect(() => {
        if (!mountRef.current) return;

        const resize = () => {
          if (viewerRef.current && mountRef.current) {
            viewerRef.current.resize(
              mountRef.current.clientWidth,
              mountRef.current.clientHeight
            );
            console.log('✅ OpenLIME resized to', mountRef.current.clientWidth, 'x', mountRef.current.clientHeight);
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
            const rotScale = (model.rotationUnits && model.rotationUnits === 'rad') ? 180 / Math.PI : 1;
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
              visible: i == 0,
              zindex: selectedAssets.length - i, // THe top layer is the front one
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
          // Provide an explicit SVG annotation layer so we can inject style into the shadow root
          // (regular app CSS cannot reach inside shadow DOM).
          const baseLayerForAnnotations =
            Object.values((viewer as any).canvas?.layers ?? {}).find((l: any) => !l.overlay) ??
            Object.values((viewer as any).canvas?.layers ?? {})[0];

          // Set explicit annotation layer options to override label rendering 
          // in openlime::ManagerSvgAnnotation::LayerSvgAnnotation
          const annotationLayerOptions: any = {
            label: 'Annotations',
            annotations: [],
            // The injected style is appended to the layer's shadow root <style>.
            // Use !important to override presentation attributes set by ManagerSvgAnnotation.
            style: `
              .annotation-label-bg {
                fill: rgba(0, 0, 0, 0.4) !important;
                stroke: #dddddd !important;
                stroke-width: 1px !important;
              }
 
            `,
          };

          if (baseLayerForAnnotations) {
            annotationLayerOptions.layout = baseLayerForAnnotations.layout;
            annotationLayerOptions.transform = baseLayerForAnnotations.transform.copy();
          }

          const explicitAnnotationLayer = new (OpenLIME as any).LayerSvgAnnotation(annotationLayerOptions);
          viewer.addLayer('manager_annotations', explicitAnnotationLayer);

          const annotationManager = new OpenLIME.ManagerSvgAnnotation(viewer, {
            layer: explicitAnnotationLayer,
            activeMarker: 'disk',
            // With singleEditMode, vertex handles are shown only when exactly
            // one annotation is selected; activeAnnotation returns null otherwise.
            singleEditMode: true,
            // Capture viewer state (light direction, render mode, …) in each annotation
            enableState: true,

            // Called whenever a new annotation is created
            onCreate: (anno: SimplifiedAnnotation) => {
              if (onAnnotationCreatedRef.current) {
                console.log('OpenLIMEViewerRef:onCreate Annotation', anno);
                onAnnotationCreatedRef.current(getOcraAnnotation(anno));
              } else {
                console.log('OpenLIMEViewerRef:onCreate Missing Annotation Callback', anno);
              }
              // Some OpenLIME builds create elements without inline paint attributes and rely on
              // ManagerSvgAnnotation's style application pass (triggered on selection updates).
              // Force a style refresh so the freshly created annotation doesn't render with SVG defaults (black).
              annotationManager.deselectAll();
            },

            onDelete: (anno: SimplifiedAnnotation) => {
              if (onAnnotationDeletedRef.current) {
                console.log('OpenLIMEViewerRef:onDelete Annotation', anno);
                onAnnotationDeletedRef.current(getOcraAnnotation(anno));
              } else {
                console.log('OpenLIMEViewerRef:onDelete Missing Annotation Callback', anno);
              }
            },

            onUpdate: (anno: SimplifiedAnnotation) => {
              if (onAnnotationUpdatedRef.current) {
                console.log('OpenLIMEViewerRef:onUpdate Annotation', anno);
                const ocraAnno = getOcraAnnotation(anno);
                console.log('Update', ocraAnno);
                onAnnotationUpdatedRef.current(ocraAnno);
              } else {
                console.log('OpenLIMEViewerRef:onUpdate Missing Annotation Callback', anno);
              }
            },

            onSelectionChange: (annotations: SimplifiedAnnotation[]) => {
              if (onAnnotationSelectionChangedRef.current) {
                onAnnotationSelectionChangedRef.current(annotations.map((a) => a.id));
              }
            },

          });
          annotationManagerRef.current = annotationManager;

          // After all layers are added, setup the UI and annotation callbacks

          // Before creating the UI create a lensLayer which could be activated for each layer, to be passed to the UIBasic interface
          if (!uiRef.current) {
            console.log("Create new OpenLIME.UIBasic");
            const lensLayer = new OpenLIME.Layer({
              type: "lens",
              layers: [],
              camera: viewer.camera,
              radius: 300,
              borderEnable: true,
              borderColor: [0.5, 0.5, 0.5, 1],
              borderWidth: 5,
              visible: false,
              zindex: selectedAssets.length + 1, // Ensure lens is always on top
            });
            viewer.addLayer('lens', lensLayer);

            // Create a lens controller for focus and context exploration when lenses are enabled.
            const controllerLens = new OpenLIME.ControllerFocusContext({
              lensLayer: lensLayer,
              camera: viewer.camera,
              canvas: viewer.canvas,
            });
            viewer.pointerManager.onEvent(controllerLens);
            lensLayer.controllers.push(controllerLens);

            // Here we are: create the UI
            uiRef.current = new OpenLIME.UIBasic(viewer, {
              showLightDirections: true,
              pixelSize: scalePixelSize ?? undefined,
              annotationManager: annotationManagerRef.current,
              layerVisibilityMode: 'nonExclusive',
              lensLayer: lensLayer,
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
            uiRef.current.toggleLightController(true);
            // Show pencil tool but don't activate it by default
            // This allows single-click selection to work
            uiRef.current.actions.pencil.display = true;
            console.log('🎬 Toolbar setup: pencil displayed');

            // Leave the annotation manager in 'idle' mode at startup.
            // Single-click selection still works from 'idle': LayerSvgAnnotation
            // handles annotation clicks independently of mode, and _onSingleTap
            // auto-transitions to 'edit' on the first canvas tap.
            // Starting from 'idle' is required so the pencil button appears
            // correctly inactive (UIBasic marks it active for any mode !== 'idle',
            // so starting in 'edit' would make the button look already pressed,
            // causing the first click to be visually silent).


            // ── Marker selector panel ────────────────────────────────────────
            const freehandSettings = {
                enableSmoothingFilter: false,
                // Backward-compatible alias used by older builds.
                enableTremorFilter: false,
                sampleDistance: 1.5,
                simplifyTolerance: 1.0,
                smoothAngle: 90,
                closed: false,
                autoCloseNearStart: true,
                hitTolerance: 10,
                enableContourSnap: true,
                contourSnapRadius: 14,
                contourSnapStrength: 0.70,
                contourMinGradient: 22,
                contourAmount: 0.55,
                enableFinalRelax: true,
                finalRelaxStrength: 0.12,
                finalRelaxDenseFactor: 1.45,
                strokeWidth: 5.0,
            };
            type MarkerType = 'disk' | 'polyline' | 'polygon' | 'rect' | 'freehand';
            const markerConfigs = {
                'disk':     { type: 'disk',     opts: {} },
                'polyline': { type: 'polyline', opts: { closed: false } },
                'polygon':  { type: 'polyline', opts: { closed: true  } },
                'rect':     { type: 'rect',     opts: {} },
                'freehand': { type: 'freehand', opts: { ...freehandSettings } },
            };

            function setMarker(key: MarkerType) {
              const manager = annotationManagerRef.current;
              if (!manager) return;
              const cfg = markerConfigs[key];
              if (cfg) {
                manager.setActiveMarker(cfg.type, cfg.opts);
              } 
            }

            let programmaticPencilEnabled = false;

            // When pencil mode is activated, deselect all annotations
            uiRef.current.addEvent('pencilEnabled', () => {
              console.log('🎬 Pencil tool activated - deselecting all annotations');
              if (annotationManagerRef.current) {
                annotationManagerRef.current.deselectAll();
                if (!programmaticPencilEnabled) {
                  let marker = annotationManagerRef.current.activeMarker;
                  console.log('Set marker', marker);
                  if (marker) {
                    setMarker(marker);
                  }
                }
              }
              programmaticPencilEnabled = false;
              setIsEditing(true);
            });

            uiRef.current.addEvent('pencilDisabled', () => {
              console.log('🎬 Pencil tool deactivated');
              setIsEditing(false);
            });

            document.addEventListener('keydown', (e: KeyboardEvent) => {
              let markerType: MarkerType | undefined;
              let newClass = -1;
              if (e.key === '0') {
                markerType = 'disk';
                newClass = 0;
              } else if (e.key === '1') {
                markerType = 'polyline';
                newClass = 1;
              } else if (e.key === '2') {
                markerType = 'polygon';
                newClass = 2;
              } else if (e.key === '3') {
                markerType = 'rect';
                newClass = 3;
              } else if (e.key === '4') {
                markerType = 'freehand';
                newClass = 4;
              } else if (e.key == '5') {
                programmaticPencilEnabled = true;
                annotationManagerRef.current?.setMode('edit');
                newClass = 5;


                console.log('Edit mode')
              } else {
                console.log('Pressed', e.key, 'Annotation mode: 0=disk, 1=polyline, 2=polygon, 3=rect, 4=freehand 5=edit');
              }
              if (newClass != -1) {
                setActiveAnnotationClass(newClass);
              }
              if (markerType) {
                setMarker(markerType);
                console.log('Annotation mode set to', markerType);
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
          class: anno.class,
          data: anno.data,
          publish: anno.publish,
          state: anno.state,
        };
      };

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
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div className='openlime openlime-container'
            ref={mountRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              backgroundColor: '#404040',
            }}
          />
          {isEditing && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              pointerEvents: 'none',
              fontFamily: 'sans-serif',
              fontSize: '14px',
              zIndex: 100,
              backdropFilter: 'blur(4px)',
            }}>

              <strong>Geometry</strong> &middot; Keys:
              <code>0</code> {activeAnnotationClass == 0 ? (<strong>Disk</strong>) : (<span>Disk</span>)} |
              <code>1</code> {activeAnnotationClass == 1 ? (<strong>Polyline</strong>) : (<span>Polyline</span>)} |
              <code>2</code> {activeAnnotationClass == 2 ? (<strong>Polygon</strong>) : (<span>Polygon</span>)} |
              <code>3</code> {activeAnnotationClass == 3 ? (<strong>Rect</strong>) : (<span>Rect</span>)} |
              <code>4</code> {activeAnnotationClass == 4 ? (<strong>Freehand</strong>) : (<span>Freehand</span>)} |
              <code>5</code> {activeAnnotationClass == 5 ? (<strong>Select/Edit</strong>) : (<span>Select/Edit</span>)}
            </div>
          )}
        </div>
      );
    }
  );

OpenLIMEViewer.displayName = 'OpenLIMEViewer';

export default OpenLIMEViewer;
