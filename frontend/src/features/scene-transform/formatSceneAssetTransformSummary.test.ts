import { describe, expect, it } from 'vitest';
import { formatSceneAssetTransformSummary } from './formatSceneAssetTransformSummary';

describe('formatSceneAssetTransformSummary', () => {
  it('formats planar 2D transforms', () => {
    expect(formatSceneAssetTransformSummary({
      position: [10, -2, 99],
      rotation: [1, 2, 15],
      scale: 1.5,
    }, '2D')).toBe('Transform: t(10, -2) · rotZ 15° · s 1.5');
  });

  it('formats full 3D transforms and collapses uniform scale vectors', () => {
    expect(formatSceneAssetTransformSummary({
      position: [1, 2, 3],
      rotation: [10, 20, 30],
      scale: [2, 2, 2],
    }, '3D')).toBe('Transform: t(1, 2, 3) · r(10, 20, 30°) · s 2');

    expect(formatSceneAssetTransformSummary({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 2, 3],
    }, '3D')).toBe('Transform: t(0, 0, 0) · r(0, 0, 0°) · s 1, 2, 3');
  });

  it('defaults missing transform to identity', () => {
    expect(formatSceneAssetTransformSummary(undefined, '2D')).toBe('Transform: t(0, 0) · rotZ 0° · s 1');
    expect(formatSceneAssetTransformSummary(null, '3D')).toBe('Transform: t(0, 0, 0) · r(0, 0, 0°) · s 1');
  });
});
