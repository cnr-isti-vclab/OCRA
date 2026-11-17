import type { AnnotationShape } from 'shared/annotation-types';
import type { SceneDescription } from 'shared/scene-types';
import { toOpenLimeInstanceId } from '../openlime-viewer/openlimeScenePackage';

/**
 * OpenLIME annotation vertices live in **layer image space** (origin top-left, Y down),
 * not scene space. The SVG annotation layer copies a base layer's layout+transform;
 * asset-scoped storage must use that asset's image frame.
 *
 * Conversion uses the full layer→scene similarity (placement ∘ assetToLocal, etc.),
 * never placement translation alone.
 */
export interface LayerImageFrame {
  x: number;
  y: number;
  /** Degrees; OpenLIME Transform.a */
  rotationDeg: number;
  scale: number;
  width: number;
  height: number;
}

type OpenLimeLayerLike = {
  overlay?: boolean;
  transform?: { x?: number; y?: number; a?: number; z?: number; copy?: () => unknown };
  layout?: { boundingBox?: () => { width: () => number; height: () => number } };
  getAnnotationById?: unknown;
};

type OpenLimeCanvasLike = {
  layers?: Record<string, OpenLimeLayerLike>;
};

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function applySimilarity(
  x: number,
  y: number,
  frame: Pick<LayerImageFrame, 'x' | 'y' | 'rotationDeg' | 'scale'>,
): { x: number; y: number } {
  const angle = degToRad(frame.rotationDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return { x: rx * frame.scale + frame.x, y: ry * frame.scale + frame.y };
}

function applyInverseSimilarity(
  x: number,
  y: number,
  frame: Pick<LayerImageFrame, 'x' | 'y' | 'rotationDeg' | 'scale'>,
): { x: number; y: number } {
  const dx = x - frame.x;
  const dy = y - frame.y;
  const invScale = 1 / (frame.scale === 0 ? 1 : frame.scale);
  const angle = -degToRad(frame.rotationDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: (dx * cos - dy * sin) * invScale, y: (dx * sin + dy * cos) * invScale };
}

export function readLayerImageFrame(layer: OpenLimeLayerLike | null | undefined): LayerImageFrame | null {
  const transform = layer?.transform;
  const box = layer?.layout?.boundingBox?.();
  if (!transform || !box) return null;
  const width = box.width();
  const height = box.height();
  if (!(width > 0 && height > 0)) return null;
  const scale = transform.z ?? 1;
  return {
    x: transform.x ?? 0,
    y: transform.y ?? 0,
    rotationDeg: transform.a ?? 0,
    scale: scale === 0 ? 1 : scale,
    width,
    height,
  };
}

export function framesEqual(a: LayerImageFrame, b: LayerImageFrame): boolean {
  return a.x === b.x
    && a.y === b.y
    && a.rotationDeg === b.rotationDeg
    && a.scale === b.scale
    && a.width === b.width
    && a.height === b.height;
}

/** Image (top-left, Y down) → scene (center, Y up) via layer transform. */
export function transformPointImageToScene(
  point: [number, number, number],
  frame: LayerImageFrame,
): [number, number, number] {
  const layerX = point[0] - frame.width / 2;
  const layerY = frame.height / 2 - point[1];
  const scene = applySimilarity(layerX, layerY, frame);
  return [scene.x, scene.y, point[2]];
}

/** Scene → layer image space. */
export function transformPointSceneToImage(
  point: [number, number, number],
  frame: LayerImageFrame,
): [number, number, number] {
  const layer = applyInverseSimilarity(point[0], point[1], frame);
  return [layer.x + frame.width / 2, frame.height / 2 - layer.y, point[2]];
}

function mapShapeVertices(
  shapes: AnnotationShape[],
  mapPoint: (point: [number, number, number]) => [number, number, number],
): AnnotationShape[] {
  return shapes.map((shape) => ({
    ...shape,
    vertices: shape.vertices.map((vertex) => mapPoint([vertex[0], vertex[1], vertex[2]])),
    ...(shape.type !== 'ShapePoints' && shape.surfacePath
      ? {
          surfacePath: {
            mode: shape.surfacePath.mode,
            controlVertices: shape.surfacePath.controlVertices.map((vertex) =>
              mapPoint([vertex[0], vertex[1], vertex[2]]),
            ),
          },
        }
      : {}),
  }));
}

/** Remap OpenLIME image-space shapes between two layer frames (via scene). */
export function transformShapesBetweenImageFrames(
  shapes: AnnotationShape[],
  from: LayerImageFrame,
  to: LayerImageFrame,
): AnnotationShape[] {
  if (framesEqual(from, to)) return shapes;
  return mapShapeVertices(shapes, (point) =>
    transformPointSceneToImage(transformPointImageToScene(point, from), to),
  );
}

export function sceneHasAsset(
  scene: SceneDescription | null | undefined,
  assetId: string,
): boolean {
  return Boolean(scene?.models?.some((model) => model.id === assetId));
}

function isAnnotationLayer(layer: OpenLimeLayerLike): boolean {
  return typeof layer.getAnnotationById === 'function' || layer.overlay === true;
}

/** First viewable leaf for an OCRA asset id in the mounted OpenLIME canvas. */
export function findAssetLayer(
  canvas: OpenLimeCanvasLike | null | undefined,
  assetId: string,
  scene: SceneDescription | null | undefined,
): OpenLimeLayerLike | null {
  const layers = canvas?.layers;
  if (!layers) return null;

  const instanceId = toOpenLimeInstanceId(assetId);
  const prefixed = Object.entries(layers).filter(([key, layer]) => {
    if (isAnnotationLayer(layer)) return false;
    return key === instanceId || key.startsWith(`${instanceId}/`);
  });
  if (prefixed[0]) return prefixed[0][1];

  // SceneSession.openAsset uses synthetic instance id "asset".
  const onlyModel = scene?.models?.length === 1 ? scene.models[0] : null;
  if (onlyModel?.id === assetId) {
    const base = Object.values(layers).find((layer) => !isAnnotationLayer(layer));
    return base ?? null;
  }
  return null;
}

export function assetLayerImageFrame(
  canvas: OpenLimeCanvasLike | null | undefined,
  assetId: string,
  scene: SceneDescription | null | undefined,
): LayerImageFrame | null {
  return readLayerImageFrame(findAssetLayer(canvas, assetId, scene));
}

/** Point the SVG annotation layer at an asset leaf so draws land in that asset's image space. */
export function bindAnnotationLayerToAsset(
  annotationLayer: OpenLimeLayerLike | null | undefined,
  assetLayer: OpenLimeLayerLike | null | undefined,
): void {
  if (!annotationLayer || !assetLayer?.layout || !assetLayer.transform) return;
  annotationLayer.layout = assetLayer.layout;
  annotationLayer.transform = typeof assetLayer.transform.copy === 'function'
    ? assetLayer.transform.copy() as OpenLimeLayerLike['transform']
    : { ...assetLayer.transform };
}

/**
 * Annotation layers keep a transform *copy* of a base layer. Copy again from the base that
 * currently shares `layout`, so placement updates from SceneProjection stay in sync.
 */
export function refreshAnnotationLayerTransform(
  annotationLayer: OpenLimeLayerLike | null | undefined,
  canvas: OpenLimeCanvasLike | null | undefined,
): void {
  if (!annotationLayer?.layout || !canvas?.layers) return;
  const source = Object.values(canvas.layers).find((layer) => (
    !isAnnotationLayer(layer)
    && layer.layout === annotationLayer.layout
    && layer.transform
  ));
  if (!source?.transform) return;
  annotationLayer.transform = typeof source.transform.copy === 'function'
    ? source.transform.copy() as OpenLimeLayerLike['transform']
    : { ...source.transform };
}
