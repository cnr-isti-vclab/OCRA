import { describe, expect, it } from 'vitest';
import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';
import { resolveEditorLockOriginScope } from './resolveEditorLockOriginScope';

const sceneGeometry = {
  id: 'g-scene',
  referenceType: 'scene',
  referenceId: 'scene-1',
} as AnnotationGeometry;

const assetGeometry = {
  id: 'g-asset',
  referenceType: 'asset',
  referenceId: 'asset-7',
} as AnnotationGeometry;

const sceneData = {
  id: 'd-scene',
  visibilityType: 'scene',
  visibilityId: 'scene-1',
} as AnnotationData;

const assetData = {
  id: 'd-asset',
  visibilityType: 'asset',
  visibilityId: 'asset-7',
} as AnnotationData;

const link = {
  id: 'l1',
  geometryId: 'g-asset',
  dataId: 'd-scene',
} as AnnotationLink;

const maps = {
  getGeometry: (id: string) => (
    id === sceneGeometry.id ? sceneGeometry : id === assetGeometry.id ? assetGeometry : undefined
  ),
  getData: (id: string) => (
    id === sceneData.id ? sceneData : id === assetData.id ? assetData : undefined
  ),
  getLink: (id: string) => (id === link.id ? link : undefined),
};

describe('resolveEditorLockOriginScope', () => {
  it('uses geometry reference scope', () => {
    expect(resolveEditorLockOriginScope('geometry', 'g-asset', 'scene-1', maps)).toEqual({
      originScopeType: 'asset',
      originScopeId: 'asset-7',
    });
    expect(resolveEditorLockOriginScope('geometry', 'g-scene', 'scene-1', maps)).toEqual({
      originScopeType: 'scene',
      originScopeId: 'scene-1',
    });
  });

  it('uses data visibility scope', () => {
    expect(resolveEditorLockOriginScope('data', 'd-asset', 'scene-1', maps)).toEqual({
      originScopeType: 'asset',
      originScopeId: 'asset-7',
    });
    expect(resolveEditorLockOriginScope('data', 'd-scene', 'scene-1', maps)).toEqual({
      originScopeType: 'scene',
      originScopeId: 'scene-1',
    });
  });

  it('prefers geometry scope for links and falls back to scene', () => {
    expect(resolveEditorLockOriginScope('link', 'l1', 'scene-1', maps)).toEqual({
      originScopeType: 'asset',
      originScopeId: 'asset-7',
    });
    expect(resolveEditorLockOriginScope('geometry', 'missing', 'scene-1', maps)).toEqual({
      originScopeType: 'scene',
      originScopeId: 'scene-1',
    });
  });
});
