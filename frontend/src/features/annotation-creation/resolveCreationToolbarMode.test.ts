import { describe, expect, it } from 'vitest';
import {
  creationToolbarDisabledModes,
  resolveCreationToolbarMode,
} from './resolveCreationToolbarMode';

describe('resolveCreationToolbarMode', () => {
  it('keeps the drawing tool during sticky new geometry creation', () => {
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
    expect(
      resolveCreationToolbarMode('line', {
        isCreationGeometryNew: true,
        isCreationGeometrySearch: false,
        hasDraftGeometry: true,
      }),
    ).toBe('line');
  });

  it('allows edit mode once a draft geometry exists and edit is selected', () => {
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

  it('forces edit mode outside the geometry creation step', () => {
    expect(
      resolveCreationToolbarMode('line', {
        isCreationGeometryNew: false,
        isCreationGeometrySearch: false,
      }),
    ).toBe('edit');
  });

  it('lists disabled toolbar modes per wizard mode', () => {
    expect(creationToolbarDisabledModes(true, false)).toEqual(['edit']);
    expect(creationToolbarDisabledModes(true, false, true)).toEqual([]);
    expect(creationToolbarDisabledModes(false, true)).toEqual(['point', 'line', 'area']);
  });
});
