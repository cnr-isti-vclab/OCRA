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

export function containerPointToImagePixel(
  manager: OpenLIME.ManagerSvgAnnotation | null | undefined,
  container: HTMLElement | null | undefined,
  containerX: number,
  containerY: number,
): { x: number; y: number } | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return clientPointToImagePixel(manager, containerX + rect.left, containerY + rect.top);
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

export function captureViewerCanvas(container: HTMLElement | null | undefined): Promise<Blob | null> {
  if (!container) return Promise.resolve(null);
  const glCanvas = container.querySelector('canvas') as HTMLCanvasElement | null;
  if (!glCanvas) return Promise.resolve(null);

  const cssWidth = container.clientWidth;
  const cssHeight = container.clientHeight;

  return new Promise((resolve) => {
    try {
      if (glCanvas.width === cssWidth && glCanvas.height === cssHeight) {
        glCanvas.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', 0.92);
        return;
      }
      const offscreen = document.createElement('canvas');
      offscreen.width = cssWidth;
      offscreen.height = cssHeight;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(glCanvas, 0, 0, cssWidth, cssHeight);
      offscreen.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', 0.92);
    } catch {
      resolve(null);
    }
  });
}
