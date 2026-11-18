import { describe, expect, it } from 'vitest';
import {
  geometryMatchesScopeFilter,
  geometryScopeFilterFromValue,
  geometryScopeFilterToValue,
} from './geometryScopeFilter';

describe('geometryScopeFilter', () => {
  const sceneGeo = { referenceType: 'scene' as const, referenceId: 's1' };
  const assetA = { referenceType: 'asset' as const, referenceId: 'a1' };
  const assetB = { referenceType: 'asset' as const, referenceId: 'a2' };

  it('matches all / scene / asset filters', () => {
    expect(geometryMatchesScopeFilter(sceneGeo, { kind: 'all' })).toBe(true);
    expect(geometryMatchesScopeFilter(assetA, { kind: 'all' })).toBe(true);
    expect(geometryMatchesScopeFilter(sceneGeo, { kind: 'scene' })).toBe(true);
    expect(geometryMatchesScopeFilter(assetA, { kind: 'scene' })).toBe(false);
    expect(geometryMatchesScopeFilter(assetA, { kind: 'asset', assetId: 'a1' })).toBe(true);
    expect(geometryMatchesScopeFilter(assetB, { kind: 'asset', assetId: 'a1' })).toBe(false);
    expect(geometryMatchesScopeFilter(sceneGeo, { kind: 'asset', assetId: 'a1' })).toBe(false);
  });

  it('round-trips select values', () => {
    expect(geometryScopeFilterFromValue(geometryScopeFilterToValue({ kind: 'all' }))).toEqual({ kind: 'all' });
    expect(geometryScopeFilterFromValue(geometryScopeFilterToValue({ kind: 'scene' }))).toEqual({ kind: 'scene' });
    expect(geometryScopeFilterFromValue(
      geometryScopeFilterToValue({ kind: 'asset', assetId: 'urn:x' }),
    )).toEqual({ kind: 'asset', assetId: 'urn:x' });
    expect(geometryScopeFilterFromValue('nope')).toEqual({ kind: 'all' });
  });
});
