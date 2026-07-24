import { describe, expect, it } from 'vitest';
import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';
import { evaluateActiveSelection } from './annotation-selection';

function geometry(id: string): AnnotationGeometry {
  return {
    id,
    projectId: 'p1',
    shapes: [],
    referenceType: 'scene',
    referenceId: 's1',
    version: 0,
    erasableAt: null,
    erasableBy: null,
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

describe('evaluateActiveSelection after Link+Data soft-delete', () => {
  it('keeps geometry when its link and data are erasable (orphan shape)', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1')]]),
      data: new Map([['d1', datum('d1', '2026-01-02T00:00:00.000Z')]]),
      links: new Map([['l1', link('l1', 'g1', 'd1', '2026-01-02T00:00:00.000Z')]]),
    };

    const selection = evaluateActiveSelection(maps, 's1', { includeErasable: false });

    expect([...selection.geometryIds]).toEqual(['g1']);
    expect([...selection.dataIds]).toEqual([]);
    expect([...selection.linkIds]).toEqual([]);
  });

  it('hides geometry that still has a strong link only to inactive data', () => {
    const maps = {
      geometries: new Map([['g1', geometry('g1')]]),
      data: new Map([['d1', datum('d1', '2026-01-02T00:00:00.000Z')]]),
      // Link still strong while data is erasable — geometry should not stay as a labeled orphan.
      links: new Map([['l1', link('l1', 'g1', 'd1', null)]]),
    };

    const selection = evaluateActiveSelection(maps, 's1', { includeErasable: false });

    expect([...selection.geometryIds]).toEqual([]);
  });
});
