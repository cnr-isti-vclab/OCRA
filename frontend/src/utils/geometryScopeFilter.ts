export type GeometryScopeFilterValue =
  | { kind: 'all' }
  | { kind: 'scene' }
  | { kind: 'asset'; assetId: string };

export type GeometryScopeRef = {
  referenceType: 'scene' | 'asset' | string;
  referenceId: string;
};

export function geometryMatchesScopeFilter(
  geometry: GeometryScopeRef,
  filter: GeometryScopeFilterValue,
): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'scene') return geometry.referenceType === 'scene';
  return geometry.referenceType === 'asset' && geometry.referenceId === filter.assetId;
}

/** Serialize for selects / URL-ish values. */
export function geometryScopeFilterToValue(filter: GeometryScopeFilterValue): string {
  if (filter.kind === 'all') return 'all';
  if (filter.kind === 'scene') return 'scene';
  return `asset:${filter.assetId}`;
}

export function geometryScopeFilterFromValue(value: string): GeometryScopeFilterValue {
  if (value === 'all') return { kind: 'all' };
  if (value === 'scene') return { kind: 'scene' };
  if (value.startsWith('asset:')) {
    const assetId = value.slice('asset:'.length);
    if (assetId) return { kind: 'asset', assetId };
  }
  return { kind: 'all' };
}
