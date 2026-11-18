import type { AnnotationShape } from 'shared/annotation-types';
import type { SceneDescription } from 'shared/scene-types';
import { toOpenLimeInstanceId } from '../openlime-viewer/openlimeScenePackage';

/**
 * With OpenLIME `coordinateSpace: 'scene'`, create/edit/draw use scene coords.
 * Asset-scoped storage stays in that asset's **image space** (top-left, Y down);
 * convert at the OCRA boundary via the asset layer's full similarity
 * (placement ∘ assetToLocal, etc.).
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

/** OpenLIME scene coords → asset image space for persistence. */
export function transformShapesSceneToAssetImage(
  shapes: AnnotationShape[],
  assetFrame: LayerImageFrame,
): AnnotationShape[] {
  return mapShapeVertices(shapes, (point) => transformPointSceneToImage(point, assetFrame));
}

/** Asset image space → OpenLIME scene coords for display. */
export function transformShapesAssetImageToScene(
  shapes: AnnotationShape[],
  assetFrame: LayerImageFrame,
): AnnotationShape[] {
  return mapShapeVertices(shapes, (point) => transformPointImageToScene(point, assetFrame));
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
): OpenLimeLayerLike | null {
  const layers = canvas?.layers;
  if (!layers) return null;

  const instanceId = toOpenLimeInstanceId(assetId);
  const prefixed = Object.entries(layers).filter(([key, layer]) => {
    if (isAnnotationLayer(layer)) return false;
    return key === instanceId || key.startsWith(`${instanceId}/`);
  });
  return prefixed[0]?.[1] ?? null;
}

export function assetLayerImageFrame(
  canvas: OpenLimeCanvasLike | null | undefined,
  assetId: string,
): LayerImageFrame | null {
  return readLayerImageFrame(findAssetLayer(canvas, assetId));
}
