import { describe, expect, it } from 'vitest';
import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';
import { evaluateActiveSelection } from './annotation-selection';

const ERASED = '2026-01-02T00:00:00.000Z';

function geometry(id: string, erasableAt: string | null = null): AnnotationGeometry {
  return {
    id,
    projectId: 'p1',
    shapes: [],
    referenceType: 'scene',
    referenceId: 's1',
    version: 0,
    erasableAt,
    erasableBy: erasableAt ? 'u1' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

function datum(id: string, erasableAt: string | null = null): AnnotationData {
  return {
    id,
    projectId: 'p1',
    label: id,
    description: '',
    class: null,
    content: {},
    visibilityType: 'scene',
    visibilityId: 's1',
    version: 0,
    erasableAt,
    erasableBy: erasableAt ? 'u1' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

function link(
  id: string,
  geometryId: string,
  dataId: string,
  erasableAt: string | null = null,
): AnnotationLink {
  return {
    id,
    projectId: 'p1',
    geometryId,
    dataId,
    version: 0,
    erasableAt,
    erasableBy: erasableAt ? 'u1' : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

describe('evaluateActiveSelection rendering visibility', () => {
  it('keeps plain geometry when its only links are weak (orphan shape)', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1')]]),
      data: new Map([['d1', datum('d1', ERASED)]]),
      links: new Map([['l1', link('l1', 'g1', 'd1', ERASED)]]),
    };

    const selection = evaluateActiveSelection(maps, 's1', { showErased: false });

    expect([...selection.geometryIds]).toEqual(['g1']);
    expect([...selection.dataIds]).toEqual([]);
    expect([...selection.linkIds]).toEqual([]);
    expect(selection.renderingModeByGeometryId.get('g1')).toBe('plain');
  });

  it('keeps plain geometry visible when a strong link points to ghost data (toggle off)', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1')]]),
      data: new Map([['d1', datum('d1', ERASED)]]),
      links: new Map([['l1', link('l1', 'g1', 'd1', null)]]),
    };

    const hidden = evaluateActiveSelection(maps, 's1', { showErased: false });
    expect([...hidden.geometryIds]).toEqual(['g1']);
    expect([...hidden.dataIds]).toEqual([]);
    expect(hidden.renderingModeByGeometryId.get('g1')).toBe('plain');

    const withErased = evaluateActiveSelection(maps, 's1', { showErased: true });
    expect([...withErased.geometryIds]).toEqual(['g1']);
    expect([...withErased.dataIds]).toEqual(['d1']);
    expect([...withErased.linkIds]).toEqual(['l1']);
    expect(withErased.renderingModeByDataId.get('d1')).toBe('ghost');
  });

  it('shows ghost geometry when retained by a strong link and toggle is on', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1', ERASED)]]),
      data: new Map([['d1', datum('d1')]]),
      links: new Map([['l1', link('l1', 'g1', 'd1', null)]]),
    };

    expect([...evaluateActiveSelection(maps, 's1', { showErased: false }).geometryIds]).toEqual([]);
    const selection = evaluateActiveSelection(maps, 's1', { showErased: true });
    expect([...selection.geometryIds]).toEqual(['g1']);
    expect(selection.renderingModeByGeometryId.get('g1')).toBe('ghost');
  });

  it('shows weak orphans (none mode) when erased toggle is on', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1', ERASED)]]),
      data: new Map([['d1', datum('d1', ERASED)]]),
      links: new Map([['l1', link('l1', 'g1', 'd1', ERASED)]]),
    };

    expect([...evaluateActiveSelection(maps, 's1', { showErased: false }).geometryIds]).toEqual([]);
    const selection = evaluateActiveSelection(maps, 's1', { showErased: true });
    expect([...selection.geometryIds]).toEqual(['g1']);
    expect([...selection.dataIds]).toEqual(['d1']);
    expect(selection.renderingModeByGeometryId.get('g1')).toBe('none');
    expect(selection.renderingModeByDataId.get('d1')).toBe('none');
    // Weak links stay out of active link indexes.
    expect([...selection.linkIds]).toEqual([]);
  });
});
