import type { AnnotationGeometry, AnnotationShape } from 'shared/annotation-types';

const LABEL_BY_SHAPE_TYPE: Record<AnnotationShape['type'], string> = {
  ShapePoints: 'Point',
  ShapePolyline: 'Line',
  ShapePolygon: 'Area',
};

/** Returns the user-facing type of an annotation geometry's primary shape. */
export function getAnnotationGeometryTypeLabel(geometry: AnnotationGeometry): string {
  return LABEL_BY_SHAPE_TYPE[geometry.shapes[0].type];
}
