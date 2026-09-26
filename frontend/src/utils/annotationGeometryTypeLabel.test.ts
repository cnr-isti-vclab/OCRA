import { describe, expect, it } from 'vitest';
import type { AnnotationGeometry, AnnotationShape } from 'shared/annotation-types';
import { getAnnotationGeometryTypeLabel } from './annotationGeometryTypeLabel';

function geometry(shape: AnnotationShape): AnnotationGeometry {
  return { shapes: [shape] } as AnnotationGeometry;
}

describe('getAnnotationGeometryTypeLabel', () => {
  const cases: Array<[AnnotationShape, string]> = [
    [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }, 'Point'],
    [{ type: 'ShapePolyline', vertices: [[0, 0, 0], [1, 1, 1]] }, 'Line'],
    [{ type: 'ShapePolygon', vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }, 'Area'],
  ];

  it.each(cases)('maps shape to %s', (shape, expected) => {
    expect(getAnnotationGeometryTypeLabel(geometry(shape))).toBe(expected);
  });
});
