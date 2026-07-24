import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';
import {
  buildPendingResolution,
  counterpartFullyCoveredByLinks,
  expandBasketForFanOut,
  expandBasketForSelectedLinks,
  linkIdsForCounterparts,
  needsCardinalityResolution,
  resolveDeletionCardinalityModal,
} from './expandDeletionBasket';

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

const links = [
  link('l1', 'g1', 'd1'),
  link('l2', 'g1', 'd2'),
  link('l3', 'g2', 'd1'),
];

describe('resolveDeletionCardinalityModal', () => {
  it('uses fan-out when exactly one endpoint type is on', () => {
    expect(resolveDeletionCardinalityModal({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    })).toBe('fanOut');
    expect(resolveDeletionCardinalityModal({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
    })).toBe('fanOut');
  });

  it('uses link resolution for link-only and full triplet', () => {
    expect(resolveDeletionCardinalityModal({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
    })).toBe('linkResolution');
    expect(resolveDeletionCardinalityModal({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
    })).toBe('linkResolution');
  });
});

describe('needsCardinalityResolution', () => {
  it('returns null for a single incident link', () => {
    expect(needsCardinalityResolution(
      { deleteLink: true, deleteGeometry: true, deleteData: false },
      [links[0]!],
    )).toBeNull();
  });

  it('returns the modal kind for multiple incident links', () => {
    expect(needsCardinalityResolution(
      { deleteLink: true, deleteGeometry: true, deleteData: false },
      [links[0]!, links[1]!],
    )).toBe('fanOut');
  });
});

describe('expandBasketForFanOut', () => {
  it('adds geometry + all incident links without counterpart data', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    };
    const pending = buildPendingResolution(
      'geometry',
      'g1',
      [links[0]!, links[1]!],
      'fanOut',
    );
    expect(expandBasketForFanOut(draft, pending, links)).toEqual({
      candidateLinkIds: ['l1', 'l2'],
      candidateGeometryIds: ['g1'],
      candidateDataIds: [],
    });
  });

  it('adds data + all incident links without counterpart geometries', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
    };
    const pending = buildPendingResolution(
      'data',
      'd1',
      [links[0]!, links[2]!],
      'fanOut',
    );
    expect(expandBasketForFanOut(draft, pending, links)).toEqual({
      candidateLinkIds: ['l1', 'l3'],
      candidateGeometryIds: [],
      candidateDataIds: ['d1'],
    });
  });
});

describe('expandBasketForSelectedLinks', () => {
  it('link-only never adds endpoints', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
    };
    const pending = buildPendingResolution(
      'geometry',
      'g1',
      [links[0]!, links[1]!],
      'linkResolution',
    );
    expect(expandBasketForSelectedLinks(draft, pending, ['l1'], links)).toEqual({
      candidateLinkIds: ['l1'],
      candidateGeometryIds: [],
      candidateDataIds: [],
    });
  });

  it('full triplet All includes covered counterparts', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
    };
    const pending = buildPendingResolution(
      'geometry',
      'g1',
      [links[0]!, links[1]!],
      'linkResolution',
    );
    // d1 also has l3 → g2, so choosing only l1+l2 does not fully cover d1;
    // d2 only has l2 among these links → covered when l2 chosen.
    expect(expandBasketForSelectedLinks(draft, pending, ['l1', 'l2'], links)).toEqual({
      candidateLinkIds: ['l1', 'l2'],
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d2'],
    });
  });

  it('omits initiating endpoint when not all its links are chosen', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
    };
    const pending = buildPendingResolution(
      'geometry',
      'g1',
      [links[0]!, links[1]!],
      'linkResolution',
    );
    expect(expandBasketForSelectedLinks(draft, pending, ['l1'], links)).toEqual({
      candidateLinkIds: ['l1'],
      candidateGeometryIds: [],
      candidateDataIds: [],
    });
  });
});

describe('counterpartFullyCoveredByLinks / linkIdsForCounterparts', () => {
  it('detects full coverage', () => {
    expect(counterpartFullyCoveredByLinks('data', 'd2', new Set(['l2']), links)).toBe(true);
    expect(counterpartFullyCoveredByLinks('data', 'd1', new Set(['l1']), links)).toBe(false);
  });

  it('maps counterpart picks to incident links', () => {
    const pending = buildPendingResolution(
      'geometry',
      'g1',
      [links[0]!, links[1]!],
      'pickCounterparts',
    );
    expect(linkIdsForCounterparts(pending, ['d2'], links)).toEqual(['l2']);
    expect(linkIdsForCounterparts(pending, ['d1', 'd2'], links).sort()).toEqual(['l1', 'l2']);
  });
});
