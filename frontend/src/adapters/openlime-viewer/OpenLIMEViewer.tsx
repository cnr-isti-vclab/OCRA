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
import type { OpenLimeLayout } from 'shared/types';
import { isOpenLime2DAsset } from 'shared/openlime-layout';
import { parseOpenLimeLayout, resolveOpenLimeImageLayout } from '../../utils/openLimeAsset.ts';
import ViewerLayersPanel, {
  type ViewerBackgroundLayer,
  type ViewerLensLayer,
} from '../../shared/ui/ViewerLayersPanel.tsx';
import type { ViewerToolbarAction } from '../../shared/ui/ViewerToolbar.tsx';

export interface OpenLimeLightDirection {
  x: number;
  y: number;
}

interface OpenLimeLightTool {
  direction: OpenLimeLightDirection;
  setDirection(x: number, y: number, duration?: number, source?: string): boolean;
  setActive(active: boolean): boolean;
  addEvent(event: 'change', callback: (direction: OpenLimeLightDirection) => void): void;
}

interface OpenLimeLayerSignals {
  addEvent(event: 'ready', callback: () => void): void;
  removeEvent(event: 'ready', callback: () => void): boolean;
}

function parseRtiAcquisitionLightDirections(metadata: unknown): OpenLimeLightDirection[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const lights = (metadata as { lights?: unknown }).lights;
  if (!Array.isArray(lights)) return [];
  const vectors: unknown[][] = typeof lights[0] === 'number'
    ? Array.from({ length: Math.floor(lights.length / 3) }, (_, index) => lights.slice(index * 3, index * 3 + 3))
    : lights.filter((light): light is unknown[] => Array.isArray(light));
  return vectors.flatMap((vector) => {
    const [x, y, z] = vector;
    if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value))) return [];
    const length = Math.hypot(x, y, z);
    if (length === 0 || z < 0) return [];
    const direction = { x: x / length, y: y / length };
    return direction.x * direction.x + direction.y * direction.y <= 1.0001 ? [direction] : [];
  });
}

const RTI_LAYOUT_PROBES = [
  { layout: 'tarzoom', fileName: 'plane_0.tzi' },
  { layout: 'deepzoom', fileName: 'plane_0.dzi' },
  { layout: 'itarzoom', fileName: 'planes.tzi' },
  { layout: 'image', fileName: 'plane_0.jpg' },
] as const;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeAssetEntryPointUrl(entryPointUrl: string): string {
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
async function autodetectRtiLayout(entryPointUrl: string): Promise<OpenLimeLayout | null> {
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

export function simplifiedAnnotationToViewerAnnotation(anno: SimplifiedAnnotation): ViewerAnnotation {
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
    geometry = [];
    geometry.push([anno.data?._markerCorners[0].x, anno.data?._markerCorners[0].y, 0]);
    geometry.push([anno.data?._markerCorners[1].x, anno.data?._markerCorners[0].y, 0]);
    geometry.push([anno.data?._markerCorners[1].x, anno.data?._markerCorners[1].y, 0]);
    geometry.push([anno.data?._markerCorners[0].x, anno.data?._markerCorners[1].y, 0]);
  } else if (markerType === 'freehand') {
    annoType = 'line';
    geometry = anno.data?._markerPoints.map((point: any) => [point.x, point.y, 0]);
  }

  if (geometry.length === 0) {
    geometry = [anno.data?._x || 0, anno.data?._y || 0, 0];
  }

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

function getOcraAnnotation(anno: SimplifiedAnnotation): ViewerAnnotation {
  return simplifiedAnnotationToViewerAnnotation(anno);
}

export interface OpenLIMEViewerRef {
  // Camera controls
  resetCamera: () => void;
  executeAction: (id: string, event?: Event) => boolean;
  /** Updates RTI illumination through OpenLIME's public light feature. */
  setLightDirection: (x: number, y: number) => boolean;
  /** Toggles display of acquisition-light samples for the selected lens mode. */
  setShowLensAcquisitionLights: (show: boolean) => boolean;

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
    /** Publishes headless viewer actions to the application-owned toolbar. */
    onToolbarActionsChange?: (actions: ViewerToolbarAction[]) => void;
    /** Requests that the application-owned light direction control be toggled. */
    onLightControlRequested?: () => void;
    /** Publishes light movements made through the public OpenLIME light API. */
    onLightDirectionChange?: (direction: OpenLimeLightDirection) => void;
    /** Publishes visible RTI acquisition-light samples for the light control. */
    onLensAcquisitionLightsChange?: (directions: OpenLimeLightDirection[]) => void;
    /** Indicates whether the selected lens mode has acquisition-light data. */
    onLensAcquisitionLightsAvailabilityChange?: (available: boolean) => void;
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
        onToolbarActionsChange,
        onLightControlRequested,
        onLightDirectionChange,
        onLensAcquisitionLightsChange,
        onLensAcquisitionLightsAvailabilityChange,
        annotationInteractionMode = 'edit',
        annotationLabelVisibility = 'selected',
      },
      ref
    ) => {
      const mountRef = useRef<HTMLDivElement | null>(null);
      const viewerRef = useRef<OpenLIME.Viewer | null>(null);
      const toolsRef = useRef<OpenLIME.ViewerTools | null>(null);
      const scaleBarRef = useRef<OpenLIME.ScaleBar | null>(null);
      const lensRuntimeRef = useRef<{
        layer: OpenLIME.LayerLens;
        controller: OpenLIME.ControllerFocusContext;
        choices: Array<{ id: string; label: string; layer: OpenLIME.Layer; acquisitionLights: OpenLimeLightDirection[] }>;
      } | null>(null);
      const backgroundRuntimeRef = useRef<Array<{ id: string; label: string; layer: OpenLIME.Layer }>>([]);
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
      const onToolbarActionsChangeRef = useRef<typeof onToolbarActionsChange>(onToolbarActionsChange);
      const onLightControlRequestedRef = useRef<typeof onLightControlRequested>(onLightControlRequested);
      const onLightDirectionChangeRef = useRef<typeof onLightDirectionChange>(onLightDirectionChange);
      const onLensAcquisitionLightsChangeRef = useRef<typeof onLensAcquisitionLightsChange>(onLensAcquisitionLightsChange);
      const onLensAcquisitionLightsAvailabilityChangeRef = useRef<typeof onLensAcquisitionLightsAvailabilityChange>(onLensAcquisitionLightsAvailabilityChange);
      const [layersPanelOpen, setLayersPanelOpen] = useState(false);
      const [backgroundLayers, setBackgroundLayers] = useState<ViewerBackgroundLayer[]>([]);
      const [lensLayers, setLensLayers] = useState<ViewerLensLayer[]>([]);
      const [lensEnabled, setLensEnabled] = useState(false);
      const [activeLensId, setActiveLensId] = useState<string | null>(null);
      const [showLensAcquisitionLights, setShowLensAcquisitionLights] = useState(false);
      /** Panel-driven editing must preserve the current OCRA selection. */
      const skipDeselectOnPencilEnableRef = useRef(false);

      const notifyPencilActive = (active: boolean) => {
        onPencilActiveChangeRef.current?.(active);
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
        onToolbarActionsChangeRef.current = onToolbarActionsChange;
      }, [onToolbarActionsChange]);

      useEffect(() => {
        onLightControlRequestedRef.current = onLightControlRequested;
      }, [onLightControlRequested]);

      useEffect(() => {
        onLightDirectionChangeRef.current = onLightDirectionChange;
      }, [onLightDirectionChange]);

      useEffect(() => {
        onLensAcquisitionLightsChangeRef.current = onLensAcquisitionLightsChange;
      }, [onLensAcquisitionLightsChange]);

      useEffect(() => {
        onLensAcquisitionLightsAvailabilityChangeRef.current = onLensAcquisitionLightsAvailabilityChange;
      }, [onLensAcquisitionLightsAvailabilityChange]);

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

        let resizeObserver: ResizeObserver | null = null;
        const resize = () => {
          if (viewerRef.current && mountRef.current) {
            viewerRef.current.resize(
              mountRef.current.clientWidth,
              mountRef.current.clientHeight
            );
            viewerRef.current.redraw();
          }
        };

        try {
          console.log('🎬 Initializing OpenLIME Viewer with scene:', sceneDesc);

          // The annotations sidebar changes this container's width. Preserve the
          // annotator's pan/zoom rather than treating that layout resize as Home.
          const viewer = new OpenLIME.Viewer(mountRef.current, { fitCameraOnResize: false });

          if (viewer === null) {
            throw new Error('Failed to initialize OpenLIME Viewer');
          }

          viewerRef.current = viewer;

          resize();
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(mountRef.current);
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
          resizeObserver?.disconnect();
          toolsRef.current?.destroy();
          toolsRef.current = null;
          scaleBarRef.current?.destroy();
          scaleBarRef.current = null;
          const lensRuntime = lensRuntimeRef.current;
          if (lensRuntime && viewerRef.current) {
            viewerRef.current.pointerManager.offEvent(lensRuntime.controller);
          }
          lensRuntimeRef.current = null;
          annotationManagerRef.current?.destroy();
          annotationManagerRef.current = null;
          onToolbarActionsChangeRef.current?.([]);
          if (viewerRef.current) {
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
          toolsRef.current?.destroy();
          toolsRef.current = null;
          scaleBarRef.current?.destroy();
          scaleBarRef.current = null;
          const previousLens = lensRuntimeRef.current;
          if (previousLens) viewer.pointerManager.offEvent(previousLens.controller);
          lensRuntimeRef.current = null;
          annotationManagerRef.current?.destroy();
          annotationManagerRef.current = null;
          backgroundRuntimeRef.current = [];
          setLayersPanelOpen(false);
          setLensEnabled(false);
          setLensLayers([]);
          setActiveLensId(null);
          setShowLensAcquisitionLights(false);
          onLensAcquisitionLightsChangeRef.current?.([]);
          onLensAcquisitionLightsAvailabilityChangeRef.current?.(false);
          viewer.clearLayers();


          let scalePixelSize: number | null = null;
          const backgroundRuntime: Array<{ id: string; label: string; layer: OpenLIME.Layer; relightable: boolean }> = [];

          // FIXME HOW TO HANDLE DIFFERENT PIXEL SIZES ACROSS LAYERS? SHOULD WE ENFORCE A SINGLE SCALE FOR THE WHOLE SCENE, OR ALLOW PER-LAYER SCALES?

          // Find all OpenLIME-compatible 2D assets in the scene description.
          // while keeping track of their corresponding digital assets and transformation matrices
          let selectedAssets: number[] = [];
          let matrices: OpenLIME.Transform[] = [];
          let urls: string[] = [];
          sceneDesc.models.forEach((model) => {
            const assetId = model.id;
            const foundIndex = digitalAssets.findIndex(a => a.id === assetId);
            if (foundIndex != -1) {
              const asset = digitalAssets[foundIndex];
              if (isOpenLime2DAsset(asset)) {
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
            const url = normalizeAssetEntryPointUrl(urls[i]);
            console.log(`🎬 Adding asset to OpenLIME Viewer: ${asset.fileName}, ${url}, matrix `, matrix);

            // RTI datasets expose a JSON header; ordinary images derive their
            // layout from explicit metadata or the entry-point filename.
            let pixelSizeInMM: number | null = null;
            const layerType = asset.type === 'rti' ? 'rti' : 'image';
            let layout = layerType === 'rti' ? 'deepzoom' : resolveOpenLimeImageLayout(asset);
            if (layerType === 'rti') {
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

                  const declaredLayout = parseOpenLimeLayout(info?.layout);
                  if (declaredLayout) {
                    layout = declaredLayout;
                  } else {
                    const detectedLayout = await autodetectRtiLayout(url);
                    if (detectedLayout) {
                      layout = detectedLayout;
                    } else {
                      console.warn(`⚠️ Could not autodetect RTI layout for ${url}, falling back to ${layout}`);
                    }
                  }

                  console.log(`🎬 Read RTI header from ${url}: pixelSizeInMM=${pixelSizeInMM}, layout=${layout}`);
                }
              } catch (error) {
                console.warn(`⚠️ Could not read RTI header from ${url}:`, error);
                const detectedLayout = await autodetectRtiLayout(url);
                if (detectedLayout) {
                  layout = detectedLayout;
                  console.log(`🎬 Autodetected RTI layout for ${url}: ${layout}`);
                } else {
                  console.warn(`⚠️ Could not autodetect RTI layout for ${url}, falling back to ${layout}`);
                }
              }
            }

            if (cancelled) return;

            // Add layer to viewer with appropriate options, including transformation matrix and pixel size if available
            const layerId = asset.id || `${layerType}-${i}`;
            const layerOptions: OpenLIME.LayerOptions = {
              label: asset.fileName || layerType,
              url,
              layout,
              type: layerType,
              ...(layerType === 'rti' ? { normals: false } : {}),
              visible: i == 0,
              zindex: selectedAssets.length - i, // THe top layer is the front one
            };
            if (pixelSizeInMM != null) {
              layerOptions.pixelSize = pixelSizeInMM;
            }

            const layer = new OpenLIME.Layer(layerOptions);
            viewer.addLayer(layerId, layer);
            backgroundRuntime.push({
              id: layerId,
              label: asset.fileName || layerType,
              layer,
              relightable: layerType === 'rti',
            });
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
          if (!viewerOnlyMode) {
            // Keep annotation picking available with the pencil off, without enabling edits.
            annotationManager.setInspectEnabled(true);
          }

          backgroundRuntimeRef.current = backgroundRuntime;
          setBackgroundLayers(backgroundRuntime.map(({ id, label, layer }) => ({
            id,
            label,
            visible: layer.visible,
            modes: layer.getModes().filter((mode) => mode !== 'normals'),
            mode: layer.getMode(),
          })));

          const hasRelightableLayers = backgroundRuntime.some((entry) => entry.relightable);
          const tools = new OpenLIME.ViewerTools(viewer, { features: OpenLIME.basicViewerFeatures({
            layers: { visibilityMode: 'nonExclusive', actionsVisible: false }, annotationManager,
          }) });
          const navigation = tools.getFeature('navigation') as { panzoom?: { activeModifiers: number[] } } | null;
          // Modifier bitmask 3 keeps pan available during the Ctrl+Shift temporary override.
          if (navigation?.panzoom) navigation.panzoom.activeModifiers = [0, 1, 3];
          toolsRef.current = tools;
          tools.actions.update('zoomIn', { visible: false });
          tools.actions.update('zoomOut', { visible: false });
          tools.actions.update('rotate', { visible: false });
          tools.actions.update('annotations', { visible: false, enabled: false });
          tools.actions.update('fullscreen', { order: 20 });
          tools.actions.update('light', {
            visible: hasRelightableLayers,
            order: 40,
            title: 'Light direction',
            execute: () => {
              // OCRA owns light interaction through its dedicated control. Keeping the
              // OpenLIME pointer controller inactive prevents direct canvas dragging.
              const lightTool = tools.getFeature('light') as OpenLimeLightTool | null;
              lightTool?.setActive(false);
              onLightControlRequestedRef.current?.();
            },
          });
          const lightTool = tools.getFeature('light') as OpenLimeLightTool | null;
          const publishLightDirection = (direction: OpenLimeLightDirection) => {
            const lightResponsiveModes = new Set(['light', 'diffuse', 'gray_diffuse', 'specular']);
            for (const choice of lensRuntimeRef.current?.choices ?? []) {
              if (lightResponsiveModes.has(choice.layer.getMode() ?? '')) {
                choice.layer.setLight([direction.x, direction.y], 0);
              }
            }
            viewer.redraw();
            onLightDirectionChangeRef.current?.(direction);
          };
          lightTool?.setActive(false);
          lightTool?.addEvent('change', publishLightDirection);
          if (lightTool) publishLightDirection(lightTool.direction);
          tools.actions.register({ id: 'layers', title: 'Layers', order: 30, active: false, execute: () => {
            setLayersPanelOpen((open) => {
              const next = !open;
              tools.actions.update('layers', { active: next });
              return next;
            });
          } });
          tools.actions.register({
            id: 'settings',
            title: 'Settings',
            order: 50,
            execute: () => onSettingsRequestedRef.current?.(),
          });
          const publishToolbarActions = () => {
            onToolbarActionsChangeRef.current?.(
              tools.actions.list({ visibleOnly: true }).map(({ id, title, active, enabled }) => ({
                id,
                title,
                active,
                enabled,
              })),
            );
          };
          tools.actions.addEvent('change', publishToolbarActions);
          publishToolbarActions();

          if (scalePixelSize != null) {
            scaleBarRef.current = new OpenLIME.ScaleBar(scalePixelSize, viewer);
          }

          viewer.redraw();
          console.log('✅ OpenLIME base scene and external toolbar loaded successfully');
          onReadyRef.current?.();

          // Build independent diagnostic RTI layers after their source shaders are ready.
          const lensChoices: Array<{ id: string; label: string; layer: OpenLIME.Layer; acquisitionLights: OpenLimeLightDirection[] }> = [];
          for (const background of backgroundRuntime.filter((entry) => entry.relightable)) {
            if (background.layer.status !== 'ready') {
              await new Promise<void>((resolve) => {
                const signalLayer = background.layer as OpenLIME.Layer & OpenLimeLayerSignals;
                const onReady = () => { signalLayer.removeEvent('ready', onReady); resolve(); };
                signalLayer.addEvent('ready', onReady);
              });
            }
            if (cancelled) return;
            const acquisitionLights = parseRtiAcquisitionLightDirections((background.layer as OpenLIME.Layer & { json?: unknown }).json);
            for (const diagnostic of [{ mode: 'light', label: 'Light' }, { mode: 'gray_diffuse', label: 'Gray diffuse' }]) {
              const id = `lens:${background.id}:${diagnostic.mode}`;
              const label = backgroundRuntime.length > 1 ? `${diagnostic.label} — ${background.label}` : diagnostic.label;

              // Create a dedicated RTI layer per diagnostic mode so each variant keeps its own
              // shader state and the lens can switch modes without reusing stale uniforms from the
              // base relight layer. Use a real RTI layer instance, not a generic Layer.derive()
              // clone, because the latter does not keep the RTI shader type needed for
              // gray_diffuse / specular / normals rendering inside the lens.
              const layer = new OpenLIME.Layer({ type: 'rti', sourceLayer: background.layer,
                label,
                transform: background.layer.transform.copy(), visible: false, zindex: backgroundRuntime.length + 1 });
              layer.setMode(diagnostic.mode);

              const lightState = background.layer.getControl?.('light')?.current?.value ?? [0, 0, 1];
              // Keep the mode change visually consistent with the current relight direction.
              if (Array.isArray(lightState)) {
                layer.setLight(lightState, 0);
              }
              lensChoices.push({ id, label, layer, acquisitionLights });
            }
          }

          if (cancelled) return;
          if (lensChoices.length > 0) {
            const lensLayer = new OpenLIME.LayerLens({ layers: lensChoices.map((choice) => choice.layer), camera: viewer.camera,
              radius: 140, borderEnable: true, borderColor: [1, 0.79, 0.16, 1], borderWidth: 5,
            });
            lensLayer.zindex = backgroundRuntime.length + 2;
            lensLayer.setVisible(false);
            viewer.addLayer('lens', lensLayer);
            const controller = new OpenLIME.ControllerFocusContext({ lensLayer, camera: viewer.camera, canvas: viewer.canvas, zoomAmount: 1.15 });
            controller.active = false;
            viewer.pointerManager.onEvent(controller);
            lensLayer.controllers.push(controller);
            lensRuntimeRef.current = { layer: lensLayer, controller, choices: lensChoices };
          }

          setLensLayers(lensChoices.map(({ id, label }) => ({ id, label })));
          setActiveLensId(lensChoices[0]?.id ?? null);
          onLensAcquisitionLightsAvailabilityChangeRef.current?.((lensChoices[0]?.acquisitionLights.length ?? 0) > 0);

          // Setup event listeners for annotation layer events (update, delete)
          //setupAnnotationLayerListeners();

        };

        void loadScene();
        return () => {
          cancelled = true;
        };
      }, [sceneDesc, digitalAssets, annotationInteractionMode]);

      const closeLayersPanel = () => {
        setLayersPanelOpen(false);
        toolsRef.current?.actions.update('layers', { active: false });
      };

      const publishLensAcquisitionLights = (lensId: string | null, show: boolean) => {
        const choice = lensRuntimeRef.current?.choices.find((candidate) => candidate.id === lensId);
        onLensAcquisitionLightsChangeRef.current?.(show ? choice?.acquisitionLights ?? [] : []);
      };

      const setBackgroundVisibility = (id: string, visible: boolean) => {
        const entry = backgroundRuntimeRef.current.find((candidate) => candidate.id === id);
        if (!entry) return;
        entry.layer.setVisible(visible);
        setBackgroundLayers((layers) => layers.map((layer) => layer.id === id ? { ...layer, visible } : layer));
        viewerRef.current?.redraw();
      };

      const setBackgroundMode = (id: string, mode: string) => {
        const entry = backgroundRuntimeRef.current.find((candidate) => candidate.id === id);
        if (!entry) return;
        entry.layer.setMode(mode);
        setBackgroundLayers((layers) => layers.map((layer) => layer.id === id ? { ...layer, mode } : layer));
        viewerRef.current?.redraw();
      };

      const setInspectionLensEnabled = (enabled: boolean) => {
        const runtime = lensRuntimeRef.current;
        if (!runtime) return;
        runtime.layer.setVisible(enabled);
        runtime.controller.active = enabled;
        setLensEnabled(enabled);
        viewerRef.current?.redraw();
      };

      const setInspectionLensLayer = (id: string) => {
        const runtime = lensRuntimeRef.current;
        if (!runtime) return;
        const index = runtime.choices.findIndex((choice) => choice.id === id);
        if (index < 0) return;
        runtime.layer.setActiveLayer(index);
        setActiveLensId(id);
        const hasAcquisitionLights = runtime.choices[index].acquisitionLights.length > 0;
        const showLights = showLensAcquisitionLights && hasAcquisitionLights;
        if (!showLights) setShowLensAcquisitionLights(false);
        onLensAcquisitionLightsAvailabilityChangeRef.current?.(hasAcquisitionLights);
        publishLensAcquisitionLights(id, showLights);
        viewerRef.current?.redraw();
      };

      const setShowAcquisitionLights = (show: boolean) => {
        const choice = lensRuntimeRef.current?.choices.find((candidate) => candidate.id === activeLensId);
        const enabled = show && Boolean(choice?.acquisitionLights.length);
        setShowLensAcquisitionLights(enabled);
        publishLensAcquisitionLights(activeLensId, enabled);
        return enabled;
      };

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

        executeAction(id: string, event?: Event) {
          return Boolean(toolsRef.current?.execute(id, event ?? null));
        },

        setLightDirection(x: number, y: number) {
          const lightTool = toolsRef.current?.getFeature('light') as OpenLimeLightTool | null;
          if (!lightTool) return false;
          lightTool.setActive(false);
          return lightTool.setDirection(x, y, 0, 'ocra-light-control');
        },

        setShowLensAcquisitionLights(show: boolean) {
          return setShowAcquisitionLights(show);
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
          const manager = annotationManagerRef.current;
          if (!manager) return;
          const on = Boolean(enabled);
          const wasAlreadyEditing = manager.active;
          if (on) skipDeselectOnPencilEnableRef.current = true;
          manager.toggle(on);
          if (on && wasAlreadyEditing) skipDeselectOnPencilEnableRef.current = false;
          notifyPencilActive(on ? manager.active : false);
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
          <ViewerLayersPanel
            open={layersPanelOpen}
            backgroundLayers={backgroundLayers}
            lensLayers={lensLayers}
            lensEnabled={lensEnabled}
            activeLensId={activeLensId}
            onClose={closeLayersPanel}
            onBackgroundVisibilityChange={setBackgroundVisibility}
            onBackgroundModeChange={setBackgroundMode}
            onLensEnabledChange={setInspectionLensEnabled}
            onActiveLensChange={setInspectionLensLayer}
          />
        </div>
      );
    }
  );

OpenLIMEViewer.displayName = 'OpenLIMEViewer';

export default OpenLIMEViewer;
