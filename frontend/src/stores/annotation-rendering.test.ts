import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import {
  isRecoverableRenderingMode,
  isRenderingModeVisible,
  passesRenderingVisibility,
  resolveRenderingMode,
  resolveShowErased,
  structuralClassForRenderingMode,
} from './annotation-rendering';

const ERASED = '2026-01-02T00:00:00.000Z';

function link(erasable: boolean): AnnotationLink {
  return {
    id: 'l1',
    projectId: 'p1',
    geometryId: 'g1',
    dataId: 'd1',
    version: 0,
    erasableAt: erasable ? ERASED : null,
    erasableBy: erasable ? 'u1' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

describe('resolveRenderingMode', () => {
  it('returns plain when the object is not erasable', () => {
    expect(resolveRenderingMode({ erasableAt: null }, [])).toBe('plain');
    expect(resolveRenderingMode({ erasableAt: null }, [link(true)])).toBe('plain');
  });

  it('returns ghost when erasable but a strong incident link exists', () => {
    expect(resolveRenderingMode({ erasableAt: ERASED }, [link(false)])).toBe('ghost');
    expect(resolveRenderingMode({ erasableAt: ERASED }, [link(true), link(false)])).toBe('ghost');
  });

  it('returns none when erasable and only weak or no incident links exist', () => {
    expect(resolveRenderingMode({ erasableAt: ERASED }, [])).toBe('none');
    expect(resolveRenderingMode({ erasableAt: ERASED }, [link(true)])).toBe('none');
  });

  it('does not depend on counterpart endpoint state (only incident links matter)', () => {
    const weakLink = link(true);
    expect(resolveRenderingMode({ erasableAt: ERASED }, [weakLink])).toBe('none');
    expect(resolveRenderingMode({ erasableAt: null }, [weakLink])).toBe('plain');
  });
});

describe('structuralClassForRenderingMode', () => {
  it('maps ghost and none to OpenLIME classes', () => {
    expect(structuralClassForRenderingMode('plain')).toBeNull();
    expect(structuralClassForRenderingMode('ghost')).toBe('ghost');
    expect(structuralClassForRenderingMode('none')).toBe('orphan');
  });
});

describe('isRecoverableRenderingMode', () => {
  it('is true for ghost and orphan (none)', () => {
    expect(isRecoverableRenderingMode('plain')).toBe(false);
    expect(isRecoverableRenderingMode('ghost')).toBe(true);
    expect(isRecoverableRenderingMode('none')).toBe(true);
  });
});

describe('isRenderingModeVisible', () => {
  it('always shows plain', () => {
    expect(isRenderingModeVisible('plain', false)).toBe(true);
    expect(isRenderingModeVisible('plain', true)).toBe(true);
  });

  it('shows ghost and orphan only when erased are visible', () => {
    expect(isRenderingModeVisible('ghost', false)).toBe(false);
    expect(isRenderingModeVisible('ghost', true)).toBe(true);
    expect(isRenderingModeVisible('none', false)).toBe(false);
    expect(isRenderingModeVisible('none', true)).toBe(true);
  });
});

describe('passesRenderingVisibility', () => {
  it('matches the 3x2 truth table for object erasable x strong link', () => {
    const strong = [link(false)];
    const weak = [link(true)];

    expect(passesRenderingVisibility({ erasableAt: null }, strong, false)).toBe(true);
    expect(passesRenderingVisibility({ erasableAt: null }, strong, true)).toBe(true);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, strong, false)).toBe(false);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, strong, true)).toBe(true);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, weak, false)).toBe(false);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, weak, true)).toBe(true);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, [], false)).toBe(false);
    expect(passesRenderingVisibility({ erasableAt: ERASED }, [], true)).toBe(true);
  });
});

describe('resolveShowErased', () => {
  it('prefers showErased, then showGhost, then includeErasable', () => {
    expect(resolveShowErased({})).toBe(false);
    expect(resolveShowErased({ includeErasable: true })).toBe(true);
    expect(resolveShowErased({ showGhost: true })).toBe(true);
    expect(resolveShowErased({ showErased: false, showGhost: true })).toBe(false);
    expect(resolveShowErased({ showErased: true })).toBe(true);
  });
});
