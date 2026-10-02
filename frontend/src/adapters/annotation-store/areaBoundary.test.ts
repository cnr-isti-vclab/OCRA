import { describe, expect, it } from 'vitest';
import { annotationGeometrySchema, annotationShapePolygonSchema } from 'shared/annotation-schema';
import type { ViewerSurfacePath } from 'shared/scene-types';
import { createEmptyActiveSelection } from '../../stores/annotation-selection';
import { draftShapesToViewerAnnotation } from '../../features/annotation-creation/draftGeometryToViewerAnnotation';
import { geometryToViewerAnnotation } from './geometryToViewerAnnotation';
import { viewerGeometryToShapes } from './viewerAnnotationToShapes';
import { shapesEqual } from './shapesEqual';

const controls: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
const vertices: [number, number, number][] = [controls[0], [1, 0, 0], controls[1], [1, 1, 0], controls[2], [0, 1, 0]];
const surfacePath: ViewerSurfacePath = { mode: 'view-projected', controlVertices: controls };

describe('3D area boundary persistence', () => {
  it('retains dense vertices and sparse controls through schema, draft, and saved viewer adapters', () => {
    const shapes = viewerGeometryToShapes('area', vertices, surfacePath);
    const geometry = annotationGeometrySchema.parse(JSON.parse(JSON.stringify({
      id: 'area-1', projectId: 'project-1', shapes,
      referenceType: 'scene', referenceId: 'scene-1', version: 0,
      createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
      createdBy: 'user-1', updatedBy: 'user-1', erasableAt: null, erasableBy: null,
    })));
    for (const viewer of [
      geometryToViewerAnnotation(geometry, createEmptyActiveSelection()),
      draftShapesToViewerAnnotation(geometry.shapes)!,
    ]) {
      expect(viewer.type).toBe('area');
      expect(viewer.geometry).toEqual(vertices);
      expect(viewer.surfacePath).toEqual(surfacePath);
      expect(viewer.surfacePath).not.toBe(surfacePath);
      expect(shapesEqual(shapes, viewerGeometryToShapes(viewer.type, viewer.geometry, viewer.surfacePath))).toBe(true);
    }
  });

  it('detects control changes even if sampled vertices did not change', () => {
    const shapes = viewerGeometryToShapes('area', vertices, surfacePath);
    const changed = structuredClone(surfacePath);
    changed.controlVertices[0][2] = 1;
    expect(shapesEqual(shapes, viewerGeometryToShapes('area', vertices, changed))).toBe(false);
    expect(shapesEqual(shapes, viewerGeometryToShapes('area', vertices))).toBe(false);
  });

  it('preserves old/2D polygons and rejects too few area controls', () => {
    const polygon = { type: 'ShapePolygon', vertices: controls };
    expect(annotationShapePolygonSchema.parse(polygon)).toEqual(polygon);
    expect(annotationShapePolygonSchema.safeParse({
      ...polygon, surfacePath: { ...surfacePath, controlVertices: controls.slice(0, 2) },
    }).success).toBe(false);
  });
});
