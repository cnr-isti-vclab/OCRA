import { describe, expect, it } from 'vitest';
import type { AnnotationData } from 'shared/annotation-types';
import { filterErasableData } from './filterErasableData';

const data = [
  { id: 'd1', label: 'Crack', class: 'aat:damage' },
  { id: 'd2', label: 'Blue pigment', class: 'aat:material' },
] as AnnotationData[];

describe('filterErasableData', () => {
  const labels = new Map([['aat:damage', 'Damage'], ['aat:material', 'Material']]);

  it('matches labels case-insensitively', () => {
    expect(filterErasableData(data, 'PIGMENT', labels).map((item) => item.id)).toEqual(['d2']);
  });

  it('matches class identifiers and resolved labels', () => {
    expect(filterErasableData(data, 'damage', labels).map((item) => item.id)).toEqual(['d1']);
    expect(filterErasableData(data, 'aat:material', labels).map((item) => item.id)).toEqual(['d2']);
  });
});
