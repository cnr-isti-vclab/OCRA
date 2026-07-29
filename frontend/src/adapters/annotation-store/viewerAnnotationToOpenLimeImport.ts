import type { ViewerAnnotation, ViewerAnnotationGeometry } from 'shared/scene-types';

/** Web Annotation JSON-LD entry accepted by OpenLIME `importAnnotations`. */
export interface OpenLimeJsonLdImportEntry {
  '@context': string;
  id: string;
  type: 'Annotation';
  target: {
    selector: {
      type: 'SvgSelector';
      value: string;
    };
  };
}

type OpenLimePoint = { x: number; y: number };

function isPointGeometry(
  geometry: ViewerAnnotationGeometry,
): geometry is [number, number, number] {
  return (
    Array.isArray(geometry) &&
    geometry.length === 3 &&
    typeof geometry[0] === 'number' &&
    !Array.isArray(geometry[0])
  );
}

function lineVertices(viewerAnno: ViewerAnnotation): [number, number, number][] | null {
  if (viewerAnno.type === 'point') {
    if (!isPointGeometry(viewerAnno.geometry)) {
      return null;
    }
    return [viewerAnno.geometry];
  }
  if (!Array.isArray(viewerAnno.geometry) || viewerAnno.geometry.length === 0) {
    return null;
  }
  const first = viewerAnno.geometry[0];
  if (!Array.isArray(first)) {
    return null;
  }
  return viewerAnno.geometry as [number, number, number][];
}

function pointsAttr(vertices: [number, number, number][]): string {
  return vertices.map((v) => `${v[0]},${v[1]}`).join(' ');
}

function verticesKey(vertices: [number, number, number][]): string {
  return vertices.map((v) => `${v[0]},${v[1]},${v[2] ?? 0}`).join('|');
}

function parsePointsAttr(attr: string): [number, number, number][] {
  return attr
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return [x, y, 0] as [number, number, number];
    });
}

/** Reads model-space vertices from an OpenLIME annotation (data or rendered SVG). */
export function openLimeAnnotationVertices(anno: {
  type?: string;
  data?: {
    _x?: number;
    _y?: number;
    _markerPoints?: OpenLimePoint[];
  };
  elements?: Array<{ classList?: { contains: (c: string) => boolean }; getAttribute?: (n: string) => string | null }>;
}): [number, number, number][] | null {
  const markerPoints = anno.data?._markerPoints;
  if (Array.isArray(markerPoints) && markerPoints.length > 0) {
    return markerPoints.map((p) => [p.x, p.y, 0]);
  }
  if (anno.data?._x != null && anno.data?._y != null) {
    return [[anno.data._x, anno.data._y, 0]];
  }
  const polyline = anno.elements?.find((el) =>
    el.classList?.contains('annotation-polyline'),
  );
  const pointsAttrValue = polyline?.getAttribute?.('points');
  if (pointsAttrValue) {
    return parsePointsAttr(pointsAttrValue);
  }
  const disk = anno.elements?.find((el) => el.classList?.contains('annotation-disk'));
  const cx = disk?.getAttribute?.('cx');
  const cy = disk?.getAttribute?.('cy');
  if (cx != null && cy != null) {
    return [[Number(cx), Number(cy), 0]];
  }
  return null;
}

export function viewerGeometryMatchesOpenLime(
  viewerAnno: ViewerAnnotation,
  openLimeAnno: Parameters<typeof openLimeAnnotationVertices>[0],
): boolean {
  const expected = lineVertices(viewerAnno);
  const actual = openLimeAnnotationVertices(openLimeAnno);
  if (!expected || !actual) {
    return false;
  }
  return verticesKey(expected) === verticesKey(actual);
}

/** Default screen-px vertex radius (OpenLIME PolylineMarker default); scaled on prefetch. */
const DEFAULT_VERTEX_DOT_R = 5;

/** Initial model-space disk radius for import; OpenLIME rescales on prefetch. */
const DEFAULT_DISK_R = 8;

function vertexHandleDots(vertices: [number, number, number][]): string {
  return vertices
    .map(
      (v) =>
        `<circle class="annotation-vertex-dot" cx="${v[0]}" cy="${v[1]}" r="${DEFAULT_VERTEX_DOT_R}" fill="#fff" stroke="#333" stroke-width="${DEFAULT_VERTEX_DOT_R * 0.4}" style="cursor: grab"/>`,
    )
    .join('');
}

/**
 * SVG aligned with OpenLIME PolylineMarker after finalize: shape, hit target, vertex handles.
 * Handles start hidden; ManagerSvgAnnotation shows them on selection.
 */
function buildPolylineSvg(vertices: [number, number, number][], closed: boolean): string {
  const points = pointsAttr(vertices);

  const shapeTag = closed ? 'polygon' : 'polyline';
  const handles = vertexHandleDots(vertices);
  // Do not inline stroke/fill — OpenLIME applies class styles via ManagerSvgAnnotation.
  // Keep the hit target transparent for selection.
  const hitFill = closed ? 'transparent' : 'none';
  // IMPORTANT: SVG default fill is black. For open polylines we must force fill='none'
  // because OpenLIME's style pass does not set fill for non-closed lines.
  const fillAttr = closed ? '' : ' fill="none"';
  return `<g xmlns="http://www.w3.org/2000/svg"><${shapeTag} class="annotation-polyline" points="${points}"${fillAttr}/><${shapeTag} class="annotation-polyline-hit" points="${points}" stroke="transparent" fill="${hitFill}"/><g class="annotation-vertex-handles" visibility="hidden">${handles}</g></g>`;
}

/** Store-synced polylines need vertex handles for OpenLIME drag editing. */
export function openLimePolylineHasVertexHandles(anno: {
  type?: string;
  data?: { _markerPoints?: OpenLimePoint[] };
  elements?: Array<{ classList?: { contains: (c: string) => boolean } }>;
}): boolean {
  if (anno.type === 'point' || anno.type === 'disk') {
    return true;
  }
  if (!anno.data?._markerPoints?.length) {
    return false;
  }
  return (
    anno.elements?.some((el) => el.classList?.contains('annotation-vertex-handles')) ??
    false
  );
}

function buildDiskSvg(x: number, y: number): string {
  // No inline fill/stroke — OpenLIME applies class styles via ManagerSvgAnnotation.
  return `<g xmlns="http://www.w3.org/2000/svg"><circle class="annotation-disk" cx="${x}" cy="${y}" r="${DEFAULT_DISK_R}"/></g>`;
}

/**
 * Builds a JSON-LD import entry for store geometries (points, lines, areas).
 * Uses `importAnnotations` so sync never fires OpenLIME `create` events.
 */
export function viewerAnnotationToOpenLimeJsonLd(
  viewerAnno: ViewerAnnotation,
): OpenLimeJsonLdImportEntry | null {
  if (viewerAnno.type === 'point') {
    const v = lineVertices(viewerAnno);
    if (!v?.[0]) {
      return null;
    }
    return {
      '@context': 'http://www.w3.org/ns/anno.jsonld',
      id: viewerAnno.id,
      type: 'Annotation',
      target: {
        selector: {
          type: 'SvgSelector',
          value: buildDiskSvg(v[0][0], v[0][1]),
        },
      },
    };
  }

  const vertices = lineVertices(viewerAnno);
  if (!vertices || vertices.length < 2) {
    return null;
  }

  const closed = viewerAnno.type === 'area';
  return {
    '@context': 'http://www.w3.org/ns/anno.jsonld',
    id: viewerAnno.id,
    type: 'Annotation',
    target: {
      selector: {
        type: 'SvgSelector',
        value: buildPolylineSvg(vertices, closed),
      },
    },
  };
}

/** Metadata OpenLIME needs for selection, labels, and `getOcraAnnotation` round-trips. */
export function applyOpenLimeImportMetadata(
  anno: {
    label?: string;
    class?: string | number | null;
    type?: string;
    data?: Record<string, unknown>;
    ready?: boolean;
    needsUpdate?: boolean;
  },
  viewerAnno: ViewerAnnotation,
): void {
  anno.label = viewerAnno.label ?? '';
  anno.data = anno.data ?? {};
  anno.class = 0;
  (anno as { semanticClass?: string | null }).semanticClass = viewerAnno.semanticClass ?? null;
  (anno as { structuralClass?: string | null }).structuralClass = viewerAnno.structuralClass ?? null;
  (anno as { strokeDasharray?: string | null }).strokeDasharray = viewerAnno.strokeDasharray ?? null;

  if (viewerAnno.type === 'point') {
    const v = lineVertices(viewerAnno);
    if (v?.[0]) {
      anno.type = 'point';
      anno.data._markerType = 'disk';
      anno.data._x = v[0][0];
      anno.data._y = v[0][1];
    }
    return;
  }

  const vertices = lineVertices(viewerAnno);
  if (!vertices) {
    return;
  }

  const closed = viewerAnno.type === 'area';
  const markerPoints: OpenLimePoint[] = vertices.map((v) => ({ x: v[0], y: v[1] }));
  anno.type = closed ? 'polygon' : 'polyline';
  anno.data._markerType = 'polyline';
  anno.data._markerClosed = closed;
  anno.data._markerPoints = markerPoints;
  anno.ready = false;
  anno.needsUpdate = true;
}
