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
import { OPENLIME_ANNOTATION_STYLE_CONFIG } from '../../config/annotationStyles.ts';
import { getApiBase } from '../../config/oauth.ts';
import type { OpenLimeLabelVisibility } from '../annotation-store/openlimeAnnotationAdapter.ts';
import type { AnnotationMode } from '../../features/annotation-modes/resolveAnnotationMode.ts';

const RTI_LAYOUT_PROBES = [
  { layout: 'tarzoom', fileName: 'plane_0.tzi' },
  { layout: 'deepzoom', fileName: 'plane_0.dzi' },
  { layout: 'itarzoom', fileName: 'planes.tzi' },
  { layout: 'image', fileName: 'plane_0.jpg' },
] as const;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeRtiEntryPointUrl(entryPointUrl: string): string {
  if (!(entryPointUrl.startsWith('http://') || entryPointUrl.startsWith('https://'))) {
    return entryPointUrl;
  }

  try {
    const parsed = new URL(entryPointUrl);

    // Imported scenes can carry absolute assets URLs generated on a different
    // host/port (for example localhost:3002). Re-anchor OCRA assets URLs to
    // the current API base used by this frontend runtime.
    if (parsed.pathname.startsWith('/assets/projects/')) {
      const apiBase = normalizeBaseUrl(getApiBase());
      return `${apiBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep original URL if parsing fails.
  }

  return entryPointUrl;
}

/**
 * Resolve the extracted RTI dataset root from the public `info.json` entry point URL.
 */
function getRtiAssetBaseUrl(entryPointUrl: string): string {
  const resolvedUrl = new URL(entryPointUrl, window.location.href);
  resolvedUrl.search = '';
  resolvedUrl.hash = '';
  resolvedUrl.pathname = resolvedUrl.pathname.replace(/\/[^/]*$/, '/');
  return resolvedUrl.toString();
}

async function resourceExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      return true;
    }
    if (response.status !== 405 && response.status !== 501) {
      return false;
    }
  } catch {
    // Fall back to GET when HEAD is not accepted or filtered by the server/proxy.
  }

  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Detect the OpenLIME plane layout from the files exposed from the extracted RTI ZIP.
 */
async function autodetectRtiLayout(entryPointUrl: string): Promise<string | null> {
  const baseUrl = getRtiAssetBaseUrl(entryPointUrl);

  for (const probe of RTI_LAYOUT_PROBES) {
    const probeUrl = new URL(probe.fileName, baseUrl).toString();
    if (await resourceExists(probeUrl)) {
      return probe.layout;
    }
  }

  return null;
}

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
    label: anno.label || '',
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

  /** Enables/disables the OpenLIME pencil tool (annotation system). */
  enableEditing: (enabled: boolean) => void;
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
    /** Fired when the user starts dragging a vertex or disc handle (pointerdown). */
    onAnnotationEditStart?: (annotation: ViewerAnnotation) => void;
    /** Fired when the OpenLIME pencil (annotation tool) is enabled or disabled. */
    onPencilActiveChange?: (active: boolean) => void;
    /** Fired when the OpenLIME settings button is pressed. */
    onSettingsRequested?: () => void;
    annotationInteractionMode?: AnnotationMode;
    annotationLabelVisibility?: OpenLimeLabelVisibility;
  }>(
    (
      {
        sceneDesc,
        digitalAssets,
        onReady,
        onError,
        onAnnotationCreated,
        onAnnotationUpdated,
        onAnnotationDeleted,
        onAnnotationSelectionChanged,
        onAnnotationEditStart,
        onPencilActiveChange,
        onSettingsRequested,
        annotationInteractionMode = 'edit',
        annotationLabelVisibility = 'selected',
      },
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
      const onAnnotationSelectionChangedRef = useRef<typeof onAnnotationSelectionChanged>(onAnnotationSelectionChanged);
      const onAnnotationEditStartRef = useRef<typeof onAnnotationEditStart>(onAnnotationEditStart);
      const onPencilActiveChangeRef = useRef<typeof onPencilActiveChange>(onPencilActiveChange);
      const onSettingsRequestedRef = useRef<typeof onSettingsRequested>(onSettingsRequested);
      /** Panel-driven `enableEditing` must not clear selection via UIBasic `pencilEnabled`. */
      const skipDeselectOnPencilEnableRef = useRef(false);

      const notifyPencilActive = (active: boolean) => {
        onPencilActiveChangeRef.current?.(active);
      };

      const syncInfoButtonActiveState = (active: boolean) => {
        const container = viewerRef.current?.containerElement as HTMLElement | undefined;
        const infoButton = container?.querySelector?.('.openlime-button.openlime-info') as
          | HTMLElement
          | null
          | undefined;
        infoButton?.classList.toggle('openlime-info-active', active);
      };

      const scheduleInfoButtonActiveStateSync = (active: boolean, attempts = 8) => {
        let remainingAttempts = attempts;

        const apply = () => {
          const container = viewerRef.current?.containerElement as HTMLElement | undefined;
          const infoButton = container?.querySelector?.('.openlime-button.openlime-info') as
            | HTMLElement
            | null
            | undefined;

          if (infoButton) {
            infoButton.classList.toggle('openlime-info-active', active);
            return;
          }

          remainingAttempts -= 1;
          if (remainingAttempts > 0) {
            requestAnimationFrame(apply);
          }
        };

        requestAnimationFrame(apply);
      };

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

      useEffect(() => {
        onAnnotationEditStartRef.current = onAnnotationEditStart;
      }, [onAnnotationEditStart]);

      useEffect(() => {
        onPencilActiveChangeRef.current = onPencilActiveChange;
      }, [onPencilActiveChange]);

      useEffect(() => {
        onSettingsRequestedRef.current = onSettingsRequested;
      }, [onSettingsRequested]);

      useEffect(() => {
        const manager = annotationManagerRef.current as
          | (OpenLIME.ManagerSvgAnnotation & {
              setLabelVisibility?: (mode: OpenLimeLabelVisibility, repaint?: boolean) => OpenLimeLabelVisibility;
            })
          | null;
        manager?.setLabelVisibility?.(annotationLabelVisibility, true);
      }, [annotationLabelVisibility]);

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
            const scale = Array.isArray(model.scale)
              ? model.scale[0] ?? 1
              : model.scale ?? 1;
            const pos = model.position || [0, 0, 0];
            const rotScale = (model.rotationUnits && model.rotationUnits === 'rad') ? 180 / Math.PI : 1;
            const rot = model.rotation ? model.rotation[2] * rotScale : 0;

            if (
              Array.isArray(model.scale) &&
              (model.scale[1] !== scale || model.scale[2] !== scale)
            ) {
              console.warn(
                `OpenLIME uses uniform scaling; model ${model.id} has non-uniform scale`,
                model.scale,
                `and will use ${scale}`,
              );
            }

            let t = new OpenLIME.Transform();
            t.x = pos[0];
            t.y = pos[1];
            t.a = rot;
            t.z = scale;
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
            const url = normalizeRtiEntryPointUrl(urls[i]);
            console.log(`🎬 Adding asset to OpenLIME Viewer: ${asset.fileName}, ${url}, matrix `, matrix);

            // Read Header data if available
            let pixelSizeInMM: number | null = null;
            let layerType = 'rti';   // FIXME parameterize this based on asset type or scene description
            let layout = 'deepzoom';
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
                if (typeof info?.layout === 'string' && info.layout.trim().length > 0) {
                  layout = info.layout.trim();
                } else {
                  const detectedLayout = await autodetectRtiLayout(url);
                  if (detectedLayout) {
                    layout = detectedLayout;
                  } else {
                    console.warn(`⚠️ Could not autodetect RTI layout for ${url}, falling back to ${layout}`);
                  }
                }

                console.log(`🎬 Read header info from ${url}: pixelSizeInMM=${pixelSizeInMM}, type=${layerType}, layout=${layout}`);
              }

            } catch (error) {
              console.warn(`⚠️ Could not read pixelSizeInMM from ${url}:`, error);
              const detectedLayout = await autodetectRtiLayout(url);
              if (detectedLayout) {
                layout = detectedLayout;
                console.log(`🎬 Autodetected RTI layout for ${url}: ${layout}`);
              } else {
                console.warn(`⚠️ Could not autodetect RTI layout for ${url}, falling back to ${layout}`);
              }
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
          const viewerOnlyMode = annotationInteractionMode === 'viewer';
          const annotationStyleConfig = viewerOnlyMode
            ? {
                ...OPENLIME_ANNOTATION_STYLE_CONFIG,
                selectionFill: OPENLIME_ANNOTATION_STYLE_CONFIG.defaultFill,
                selectionStroke: OPENLIME_ANNOTATION_STYLE_CONFIG.defaultStroke,
              }
            : OPENLIME_ANNOTATION_STYLE_CONFIG;

          const annotationManager = new OpenLIME.ManagerSvgAnnotation(viewer, {
            ...annotationStyleConfig,
            labelVisibility: annotationLabelVisibility,
            activeMarker: 'disk',
            // With singleEditMode, vertex handles are shown only when exactly
            // one annotation is selected; activeAnnotation returns null otherwise.
            singleEditMode: true,
            // Avoid per-annotation state capture during viewer redraws (can become O(N) at idle).
            enableState: false,

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

            onEditStart: (anno: SimplifiedAnnotation) => {
              if (onAnnotationEditStartRef.current) {
                onAnnotationEditStartRef.current(getOcraAnnotation(anno));
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
            const lensLayer = new OpenLIME.LayerLens({
              layers: [],
              camera: viewer.camera,
              radius: 300,
              borderEnable: true,
              borderColor: [0.5, 0.5, 0.5, 1],
              borderWidth: 5,
            });
            lensLayer.setVisible(false);
            lensLayer.zindex = selectedAssets.length + 1; // Ensure lens is always on top
            viewer.addLayer('lens', lensLayer);

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
            uiRef.current.actions.zoomin.display = false;
            uiRef.current.actions.zoomout.display = false;
            uiRef.current.toggleLightController(true);
            uiRef.current.actions.pencil.display = !viewerOnlyMode;
            uiRef.current.actions.info.display = viewerOnlyMode;
            uiRef.current.actions.settings.display = true;
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
            uiRef.current.addEvent('pencilEnabled', () => {
              if (annotationManagerRef.current && !skipDeselectOnPencilEnableRef.current) {
                annotationManagerRef.current.deselectAll();
              }
              skipDeselectOnPencilEnableRef.current = false;
              notifyPencilActive(true);
            });

            uiRef.current.addEvent('pencilDisabled', () => {
              notifyPencilActive(false);
            });

            uiRef.current.addEvent('settings', () => {
              onSettingsRequestedRef.current?.();
            });

            if (viewerOnlyMode) {
              uiRef.current.toggleAnnotationInfo(true);
              scheduleInfoButtonActiveStateSync(true);
            }
          }

          // Setup event listeners for annotation layer events (update, delete)
          //setupAnnotationLayerListeners();

          viewer.redraw();
          console.log('✅ OpenLIME scene loaded successfully');
          onReadyRef.current?.();
        };

        void loadScene();
        return () => {
          cancelled = true;
        };
      }, [sceneDesc, digitalAssets, annotationInteractionMode]);

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
            const camera = viewerRef.current.camera;
            camera.setPosition(0, 0, 0, 1, 0);
            viewerRef.current.redraw();
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

        enableEditing(enabled: boolean) {
          const on = Boolean(enabled);
          const ui = uiRef.current as any;
          const manager = annotationManagerRef.current as any;
          const wasAlreadyEditing = Boolean(manager?.active);

          if (on) {
            skipDeselectOnPencilEnableRef.current = true;
          }

          // Try the official UI pathway first (keeps controllers in sync).
          if (ui && typeof ui.toggleAnnotations === 'function') {
            ui.toggleAnnotations(on);
          } else if (manager && typeof manager.toggle === 'function') {
            manager.toggle(on);
          } else if (manager && typeof manager.setMode === 'function') {
            manager.setMode(on ? 'edit' : 'idle');
          }

          // `pencilEnabled` only fires on idle→edit; clear the guard if we were already editing.
          if (on && wasAlreadyEditing) {
            skipDeselectOnPencilEnableRef.current = false;
          }

          // Defensive: keep the pencil button visual state in sync even if
          // modeChange events are missed for any reason.
          const container = viewerRef.current?.containerElement as HTMLElement | undefined;
          const pencilButton = container?.querySelector?.('.openlime-button.openlime-pencil') as
            | HTMLElement
            | null
            | undefined;
          pencilButton?.classList.toggle('openlime-pencil-active', on);

          // UIBasic modeChange may not fire when already in 'edit' (e.g. panel focus ran first).
          // Safe to notify here: onPencilActiveChange only updates toolbar visibility.
          const isActive = Boolean(manager?.active);
          notifyPencilActive(on ? isActive : false);
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
        </div>
      );
    }
  );

OpenLIMEViewer.displayName = 'OpenLIMEViewer';

export default OpenLIMEViewer;
