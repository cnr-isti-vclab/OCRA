import type { AnnotationShape } from 'shared/annotation-types';
import type { ViewerAnnotation } from 'shared/scene-types';
import { CREATION_DRAFT_GEOMETRY_ID } from './constants';

function shapeToViewerType(shape: AnnotationShape): ViewerAnnotation['type'] {
  switch (shape.type) {
    case 'ShapePoints':
      return 'point';
    case 'ShapePolyline':
      return 'line';
    case 'ShapePolygon':
    default:
      return 'area';
  }
}

function shapeToViewerGeometry(shape: AnnotationShape): ViewerAnnotation['geometry'] {
  if (shape.type === 'ShapePoints') {
    return shape.vertices[0];
  }
  return shape.vertices;
}

export function draftShapesToViewerAnnotation(
  shapes: readonly AnnotationShape[],
  label = 'Draft geometry',
): ViewerAnnotation | null {
  const shape = shapes[0];
  if (!shape) {
    return null;
  }

  return {
    id: CREATION_DRAFT_GEOMETRY_ID,
    label,
    semanticClass: null,
    strokeDasharray: '4,4',
    type: shapeToViewerType(shape),
    geometry: shapeToViewerGeometry(shape),
    description: 'Unsaved annotation geometry draft',
    createdAt: new Date().toISOString(),
    createdBy: 'creation-draft',
  };
}
