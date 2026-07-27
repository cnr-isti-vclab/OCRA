import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';
import {
  isDataHighlightedForDeletion,
  isGeometryHighlightedForDeletion,
  resolveDeletionHighlightIds,
} from './resolveDeletionHighlightIds';

function link(id: string, geometryId: string, dataId: string): AnnotationLink {
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

describe('resolveDeletionHighlightIds', () => {
  const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')];

  it('highlights basket endpoints and both ends of basket links', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d2'],
      candidateLinkIds: ['l1'],
    };
    const result = resolveDeletionHighlightIds(draft, links);
    expect(result.geometryIds).toEqual(['g1']);
    expect(result.dataIds.sort()).toEqual(['d1', 'd2'].sort());
    expect(isGeometryHighlightedForDeletion('g1', draft, links)).toBe(true);
    expect(isDataHighlightedForDeletion('d1', draft, links)).toBe(true);
    expect(isDataHighlightedForDeletion('d2', draft, links)).toBe(true);
  });

  it('uses only in-progress counterpart picks during data-led Let-me-select', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      candidateGeometryIds: ['g9'],
      candidateDataIds: [],
      candidateLinkIds: ['l9'],
      pendingResolution: {
        modal: 'pickCounterparts' as const,
        endpointKind: 'data' as const,
        endpointId: 'd1',
        incidentLinkIds: ['l1'],
        selectedCounterpartIds: ['g1'],
      },
    };
    const result = resolveDeletionHighlightIds(draft, links);
    expect(result.geometryIds).toEqual(['g1']);
    expect(result.dataIds).toEqual(['d1']);
    expect(isGeometryHighlightedForDeletion('g9', draft, links)).toBe(false);
  });

  it('includes geometry endpoint and selected counterparts during geometry-led pick', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      candidateGeometryIds: [],
      candidateDataIds: [],
      candidateLinkIds: [],
      pendingResolution: {
        modal: 'pickCounterparts' as const,
        endpointKind: 'geometry' as const,
        endpointId: 'g1',
        incidentLinkIds: ['l1', 'l2'],
        selectedCounterpartIds: ['d2'],
      },
    };
    const result = resolveDeletionHighlightIds(draft, links);
    expect(result.geometryIds).toContain('g1');
    expect(result.dataIds).toContain('d2');
  });
});
