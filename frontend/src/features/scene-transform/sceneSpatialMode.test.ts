import { describe, expect, it } from 'vitest';
import {
  assetSpatialKind,
  isAssetCompatibleWithSceneMode,
  resolveSceneSpatialMode,
} from './sceneSpatialMode';

describe('assetSpatialKind', () => {
  it('classifies displayable asset types', () => {
    expect(assetSpatialKind('3d-model')).toBe('3D');
    expect(assetSpatialKind('rti')).toBe('2D');
    expect(assetSpatialKind('image')).toBe('2D');
    expect(assetSpatialKind('video')).toBeNull();
    expect(assetSpatialKind('other')).toBeNull();
  });
});

describe('resolveSceneSpatialMode', () => {
  const assets = [
    { id: 'a3', type: '3d-model' },
    { id: 'a2', type: 'rti' },
    { id: 'img', type: 'image' },
  ];

  it('uses explicit scene.type when assets agree or are absent', () => {
    expect(resolveSceneSpatialMode({ type: '2D', assets: [] }, assets)).toBe('2D');
    expect(resolveSceneSpatialMode({ type: '3D', assets: [{ assetId: 'a3' }] }, assets)).toBe('3D');
  });

  it('overrides stored type when in-scene assets clearly disagree', () => {
    expect(resolveSceneSpatialMode({ type: '3D', assets: [{ assetId: 'a2' }] }, assets)).toBe('2D');
    expect(resolveSceneSpatialMode({ type: '2D', assets: [{ assetId: 'a3' }] }, assets)).toBe('3D');
  });

  it('derives 3D from any 3d-model in the scene', () => {
    expect(resolveSceneSpatialMode({ assets: [{ assetId: 'a3' }, { assetId: 'a2' }] }, assets)).toBe('3D');
  });

  it('derives 2D from rti/image only', () => {
    expect(resolveSceneSpatialMode({ assets: [{ assetId: 'a2' }, { assetId: 'img' }] }, assets)).toBe('2D');
  });

  it('returns null for empty or non-displayable scenes', () => {
    expect(resolveSceneSpatialMode({ assets: [] }, assets)).toBeNull();
    expect(resolveSceneSpatialMode({}, assets)).toBeNull();
  });
});

describe('isAssetCompatibleWithSceneMode', () => {
  it('allows the first displayable asset when mode is unset', () => {
    expect(isAssetCompatibleWithSceneMode('rti', null)).toBe(true);
    expect(isAssetCompatibleWithSceneMode('3d-model', null)).toBe(true);
    expect(isAssetCompatibleWithSceneMode('video', null)).toBe(false);
  });

  it('enforces exclusivity once mode is known', () => {
    expect(isAssetCompatibleWithSceneMode('rti', '2D')).toBe(true);
    expect(isAssetCompatibleWithSceneMode('3d-model', '2D')).toBe(false);
    expect(isAssetCompatibleWithSceneMode('3d-model', '3D')).toBe(true);
    expect(isAssetCompatibleWithSceneMode('image', '3D')).toBe(false);
  });
});
