import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { calculateDeletionConsequences } from './deletionConsequences';

function link(id: string, geometryId: string, dataId: string): AnnotationLink {
  return {
    id,
    projectId: 'p1',
    geometryId,
    dataId,
    version: 0,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-09-20T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

describe('calculateDeletionConsequences', () => {
  it('keeps a counterpart available when it has another project-wide link', () => {
    const result = calculateDeletionConsequences({
      endpointKind: 'geometry', endpointId: 'g1', selectedLinkIds: ['l1'],
      projectLinks: [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd1')],
      geometries: [], data: [{ id: 'd1', erasableAt: null }],
    });
    expect(result.remainingLinkCount).toBe(0);
    expect(result.newlyUnlinkedCounterparts).toEqual([]);
  });

  it('identifies an available counterpart that loses its last link', () => {
    const result = calculateDeletionConsequences({
      endpointKind: 'data', endpointId: 'd1', selectedLinkIds: ['l1'],
      projectLinks: [link('l1', 'g1', 'd1')],
      geometries: [{ id: 'g1', erasableAt: null }], data: [],
    });
    expect(result.newlyUnlinkedCounterparts).toEqual([{ kind: 'geometry', id: 'g1', wasErasable: false }]);
  });

  it('asks about a previously erasable counterpart before its last link disappears', () => {
    const result = calculateDeletionConsequences({
      endpointKind: 'geometry', endpointId: 'g1', selectedLinkIds: ['l1'],
      projectLinks: [link('l1', 'g1', 'd1')],
      geometries: [], data: [{ id: 'd1', erasableAt: '2026-09-20T00:00:00Z' }],
    });
    expect(result.newlyUnlinkedCounterparts).toEqual([{ kind: 'data', id: 'd1', wasErasable: true }]);
  });

  it('keeps the initiating endpoint visible when some links remain', () => {
    const result = calculateDeletionConsequences({
      endpointKind: 'geometry', endpointId: 'g1', selectedLinkIds: ['l1'],
      projectLinks: [link('l1', 'g1', 'd1'), link('l2', 'g1', 'd2')],
      geometries: [], data: [{ id: 'd1', erasableAt: null }, { id: 'd2', erasableAt: null }],
    });
    expect(result.initialLinkCount).toBe(2);
    expect(result.remainingLinkCount).toBe(1);
    expect(result.newlyUnlinkedCounterparts).toEqual([{ kind: 'data', id: 'd1', wasErasable: false }]);
  });
});
