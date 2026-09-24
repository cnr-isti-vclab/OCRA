import { describe, expect, it } from 'vitest';
import type { AnnotationShape } from 'shared/annotation-types';
import { createDefaultCreationDraft } from './createDefaultCreationDraft';
import {
  hasPendingCreationDraftGeometry,
  hasPendingCreationDraftShapes,
} from './creationDraftGeometry';

const pointShape = (x: number, y: number, z = 0): AnnotationShape => ({
  type: 'ShapePoints',
  vertices: [[x, y, z]],
});

describe('creationDraftGeometry', () => {
  it('detects pending native draft geometry', () => {
    const draft = {
      ...createDefaultCreationDraft('scene-1'),
      step: 'geometry' as const,
      geometryMode: 'new' as const,
      createdGeometries: [{ viewerId: 'openlime-1', shapes: [pointShape(0, 0)] }],
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(true);
    expect(hasPendingCreationDraftShapes(draft)).toBe(true);
  });

  it('returns false when geometry mode is unset', () => {
    const draft = {
      ...createDefaultCreationDraft('scene-1'),
      step: 'geometry' as const,
      geometryMode: null,
      createdGeometries: [{ viewerId: 'openlime-1', shapes: [pointShape(0, 0)] }],
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(false);
  });

  it('requires viewer id for pending geometry but not for shape overlay', () => {
    const draft = {
      ...createDefaultCreationDraft('scene-1'),
      step: 'data' as const,
      geometryMode: 'new' as const,
      createdGeometries: [{ viewerId: '', shapes: [pointShape(1, 2)] }],
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(false);
    expect(hasPendingCreationDraftShapes(draft)).toBe(true);
  });
});
