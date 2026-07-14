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
      geometryChoice: 'new' as const,
      draftShapes: [pointShape(0, 0)],
      draftGeometryViewerId: 'openlime-1',
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(true);
    expect(hasPendingCreationDraftShapes(draft)).toBe(true);
  });

  it('returns false outside new-geometry wizard steps', () => {
    const draft = {
      ...createDefaultCreationDraft('scene-1'),
      step: 'setup' as const,
      geometryChoice: 'new' as const,
      draftShapes: [pointShape(0, 0)],
      draftGeometryViewerId: 'openlime-1',
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(false);
  });

  it('requires viewer id for pending geometry but not for shape overlay', () => {
    const draft = {
      ...createDefaultCreationDraft('scene-1'),
      step: 'data' as const,
      geometryChoice: 'new' as const,
      draftShapes: [pointShape(1, 2)],
      draftGeometryViewerId: null,
    };
    expect(hasPendingCreationDraftGeometry(draft)).toBe(false);
    expect(hasPendingCreationDraftShapes(draft)).toBe(true);
  });
});
