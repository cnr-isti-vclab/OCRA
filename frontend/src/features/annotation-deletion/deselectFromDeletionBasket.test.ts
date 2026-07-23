import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import {
  deselectDataFromDeletionBasket,
  deselectGeometryFromDeletionBasket,
} from './deselectFromDeletionBasket';
import { resolveDeletionHighlightIds } from './resolveDeletionHighlightIds';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';

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

describe('resolveDeletionHighlightIds', () => {
  it('includes both endpoints of basket links', () => {
    expect(resolveDeletionHighlightIds({
      candidateGeometryIds: [],
      candidateDataIds: [],
      candidateLinkIds: ['l1'],
    }, [link('l1', 'g1', 'd1')])).toEqual({
      geometryIds: ['g1'],
      dataIds: ['d1'],
    });
  });

  it('unions basket endpoints with link endpoints', () => {
    expect(resolveDeletionHighlightIds({
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d2'],
      candidateLinkIds: ['l1'],
    }, [link('l1', 'g1', 'd1')])).toEqual({
      geometryIds: ['g1'],
      dataIds: ['d2', 'd1'],
    });
  });
});

describe('deselectFromDeletionBasket', () => {
  it('link-only: removes incident basket links from a geometry', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      candidateLinkIds: ['l1', 'l2'],
    };
    expect(deselectGeometryFromDeletionBasket(
      draft,
      'g1',
      [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')],
    )).toEqual({
      candidateLinkIds: ['l2'],
      candidateGeometryIds: [],
      candidateDataIds: [],
    });
  });

  it('link+geo: removes geometry and its links', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      candidateGeometryIds: ['g1', 'g2'],
      candidateLinkIds: ['l1', 'l2'],
    };
    expect(deselectGeometryFromDeletionBasket(
      draft,
      'g1',
      [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')],
    )).toEqual({
      candidateLinkIds: ['l2'],
      candidateGeometryIds: ['g2'],
      candidateDataIds: [],
    });
  });

  it('link+data: removes data and its links', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteData: true,
      candidateDataIds: ['d1', 'd2'],
      candidateLinkIds: ['l1', 'l2'],
    };
    expect(deselectDataFromDeletionBasket(
      draft,
      'd1',
      [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')],
    )).toEqual({
      candidateLinkIds: ['l2'],
      candidateDataIds: ['d2'],
      candidateGeometryIds: [],
    });
  });

  it('link+geo+data: keeps counterpart when it has another basket link', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
      candidateGeometryIds: ['g1', 'g2'],
      candidateDataIds: ['d1'],
      candidateLinkIds: ['l1', 'l2'],
    };
    // d1 linked to g1 and g2; deselect g1 → keep d1 via l2
    expect(deselectGeometryFromDeletionBasket(
      draft,
      'g1',
      [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd1')],
    )).toEqual({
      candidateLinkIds: ['l2'],
      candidateGeometryIds: ['g2'],
      candidateDataIds: ['d1'],
    });
  });

  it('link+geo+data: removes full triplet when counterpart has no other basket link', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d1'],
      candidateLinkIds: ['l1'],
    };
    expect(deselectGeometryFromDeletionBasket(
      draft,
      'g1',
      [link('l1', 'g1', 'd1')],
    )).toEqual({
      candidateLinkIds: [],
      candidateGeometryIds: [],
      candidateDataIds: [],
    });
  });
});
