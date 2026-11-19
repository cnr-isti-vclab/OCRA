import type * as OpenLIME from 'openlime';

// underscore-prefixed but there's no public equivalent that gives exact pixel coords
type ImageManager = OpenLIME.ManagerSvgAnnotation & {
  _eventToImageCoords?: (evt: { clientX: number; clientY: number }) => { x: number; y: number } | null;
  _imageToCanvasHtml?: (point: { x: number; y: number }) => { x: number; y: number } | null;
};

export function clientPointToImagePixel(
  manager: OpenLIME.ManagerSvgAnnotation | null | undefined,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const m = manager as ImageManager | null | undefined;
  if (!m || typeof m._eventToImageCoords !== 'function') return null;
  try {
    const p = m._eventToImageCoords({ clientX, clientY });
    return p ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

export function imagePixelToContainerPoint(
  manager: OpenLIME.ManagerSvgAnnotation | null | undefined,
  pixelX: number,
  pixelY: number,
): { x: number; y: number } | null {
  const m = manager as ImageManager | null | undefined;
  if (!m || typeof m._imageToCanvasHtml !== 'function') return null;
  try {
    const p = m._imageToCanvasHtml({ x: pixelX, y: pixelY });
    return p ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}
