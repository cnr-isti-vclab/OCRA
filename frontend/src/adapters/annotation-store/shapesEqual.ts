import type { AnnotationShape } from 'shared/annotation-types';

function verticesEqual(
  a: [number, number, number][],
  b: [number, number, number][],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (vertex, index) =>
      vertex[0] === b[index][0] &&
      vertex[1] === b[index][1] &&
      vertex[2] === b[index][2],
  );
}

function surfacePathsEqual(
  left: Extract<AnnotationShape, { type: 'ShapePolyline' }>['surfacePath'],
  right: Extract<AnnotationShape, { type: 'ShapePolyline' }>['surfacePath'],
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.mode === right.mode && verticesEqual(left.controlVertices, right.controlVertices);
}

export function shapesEqual(left: AnnotationShape[], right: AnnotationShape[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((shape, index) => {
    const other = right[index];
    if (shape.type !== other.type) {
      return false;
    }
    if (!verticesEqual(shape.vertices, other.vertices)) {
      return false;
    }
    if (shape.type !== 'ShapePoints') {
      if (other.type === 'ShapePoints') {
        return false;
      }
      return surfacePathsEqual(shape.surfacePath, other.surfacePath);
    }
    return true;
  });
}
