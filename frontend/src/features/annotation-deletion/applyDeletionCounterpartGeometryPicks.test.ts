import { describe, expect, it, vi } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { applyDeletionCounterpartGeometryPicks } from './applyDeletionCounterpartGeometryPicks';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';
import { resolveDeletionHighlightIds } from './resolveDeletionHighlightIds';

function link(
  id: string,
  geometryId: string,
  dataId: string,
): AnnotationLink {
  return {
    id,
    projectId: 'p1',
    geometryId,
    dataId,
    version: 0,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

const emptyLocks = {
  activeSocialLocks: [],
  currentStreamId: null,
  links: [] as AnnotationLink[],
  geometryIdsByDataId: new Map<string, string[]>(),
};

describe('resolveDeletionHighlightIds during data-led pick', () => {
  it('highlights only counterpart picks, not basket geometries', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteData: true,
      candidateDataIds: ['d0'],
      candidateLinkIds: ['l0'],
      candidateGeometryIds: [],
      pendingResolution: {
        modal: 'pickCounterparts' as const,
        endpointKind: 'data' as const,
        endpointId: 'd1',
        incidentLinkIds: ['l1', 'l2'],
        selectedCounterpartIds: ['g1'],
      },
    };
    expect(resolveDeletionHighlightIds(draft, [
      link('l0', 'g0', 'd0'),
      link('l1', 'g1', 'd1'),
      link('l2', 'g2', 'd1'),
    ])).toEqual({
      geometryIds: ['g1'],
      dataIds: ['d1'],
    });
  });
});

describe('applyDeletionCounterpartGeometryPicks', () => {
  it('ctrl-adds without dropping prior picks when previousSelected has stale basket ids', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteData: true,
      pendingResolution: {
        modal: 'pickCounterparts' as const,
        endpointKind: 'data' as const,
        endpointId: 'd1',
        incidentLinkIds: ['l1', 'l2'],
        selectedCounterpartIds: ['g1'],
      },
    };
    const setDeletionCounterpartSelection = vi.fn();
    const next = applyDeletionCounterpartGeometryPicks(
      ['g1', 'g2'],
      draft,
      {
        setDeletionCounterpartSelection,
        reportDeletionSelectionBlocked: vi.fn(),
      },
      emptyLocks,
      {
        toggle: true,
        // Stale baseline from before pick mode (basket geometry g0).
        previousSelectedIds: ['g0', 'g1'],
        allowedGeometryIds: new Set(['g1', 'g2']),
      },
    );
    expect(next.sort()).toEqual(['g1', 'g2']);
    expect(setDeletionCounterpartSelection).toHaveBeenCalledWith(['g1', 'g2']);
  });
});
