import { describe, expect, it } from 'vitest';
import {
  creationToolbarDisabledModes,
  resolveCreationToolbarMode,
} from './resolveCreationToolbarMode';

describe('resolveCreationToolbarMode', () => {
  it('forces draw mode during new geometry creation before a draft exists', () => {
    expect(
      resolveCreationToolbarMode('edit', {
        isCreationGeometryNew: true,
        isCreationGeometrySearch: false,
        defaultCreateMode: 'area',
      }),
    ).toBe('area');
    expect(
      resolveCreationToolbarMode('point', {
        isCreationGeometryNew: true,
        isCreationGeometrySearch: false,
      }),
    ).toBe('point');
  });

  it('allows edit mode once a draft geometry exists', () => {
    expect(
      resolveCreationToolbarMode('edit', {
        isCreationGeometryNew: true,
        isCreationGeometrySearch: false,
        hasDraftGeometry: true,
      }),
    ).toBe('edit');
  });

  it('forces edit mode during geometry search', () => {
    expect(
      resolveCreationToolbarMode('point', {
        isCreationGeometryNew: false,
        isCreationGeometrySearch: true,
      }),
    ).toBe('edit');
  });

  it('lists disabled toolbar modes per wizard mode', () => {
    expect(creationToolbarDisabledModes(true, false)).toEqual(['edit']);
    expect(creationToolbarDisabledModes(true, false, true)).toEqual([]);
    expect(creationToolbarDisabledModes(false, true)).toEqual(['point', 'line', 'area']);
  });
});
