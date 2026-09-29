import type { AnnotationShape } from 'shared/annotation-types';
import type {
  ViewerAnnotation,
  ViewerAnnotationGeometry,
  ViewerSurfacePath,
} from 'shared/scene-types';

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

/**
 * Converts a viewer geometry payload to persisted annotation shapes.
 */
export function viewerGeometryToShapes(
  type: ViewerAnnotation['type'],
  geometry: ViewerAnnotationGeometry,
  surfacePath?: ViewerSurfacePath,
): AnnotationShape[] {
  if (type === 'point') {
    if (!isPointGeometry(geometry)) {
      throw new Error('Point annotation requires a single [x, y, z] coordinate');
    }
    return [{ type: 'ShapePoints', vertices: [geometry] }];
  }

  if (!Array.isArray(geometry) || geometry.length === 0) {
    throw new Error('Line/area annotation requires at least one vertex');
  }

  const vertices = geometry as [number, number, number][];
  if (type === 'line') {
    return [{
      type: 'ShapePolyline',
      vertices,
      ...(surfacePath
        ? {
            surfacePath: {
              mode: surfacePath.mode,
              controlVertices: surfacePath.controlVertices.map(
                (vertex) => [...vertex] as [number, number, number],
              ),
            },
          }
        : {}),
    }];
  }
  return [{ type: 'ShapePolygon', vertices }];
}
