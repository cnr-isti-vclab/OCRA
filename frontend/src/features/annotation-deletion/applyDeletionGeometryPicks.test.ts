import { describe, expect, it, vi } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { applyDeletionGeometryPicks } from './applyDeletionGeometryPicks';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';

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

function linkGeoDraft(overrides: Partial<ReturnType<typeof createDefaultDeletionDraft>> = {}) {
  return {
    ...createDefaultDeletionDraft(),
    step: 'selecting' as const,
    deleteLink: true,
    deleteGeometry: true,
    deleteData: false,
    ...overrides,
  };
}

describe('applyDeletionGeometryPicks', () => {
  it('plain click replaces previous geometry selection', () => {
    const draft = linkGeoDraft({
      candidateGeometryIds: ['g1', 'g2'],
      candidateLinkIds: ['l1', 'l2'],
    });
    const actions = {
      addGeometryToDeletionBasket: vi.fn(() => ({ ok: true as const })),
      addLinkOnlyFromEndpoint: vi.fn(() => ({ ok: true as const })),
      deselectGeometryFromDeletionBasket: vi.fn(),
      reportDeletionSelectionBlocked: vi.fn(),
    };
    const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2'), link('l3', 'g3', 'd3')];

    applyDeletionGeometryPicks(
      ['g3'],
      draft,
      actions,
      {
        activeSocialLocks: [],
        currentStreamId: null,
        links,
        geometryIdsByDataId: {},
      },
      { toggle: false, previousSelectedIds: ['g2'], links },
    );

    expect(actions.deselectGeometryFromDeletionBasket).toHaveBeenCalledWith('g1');
    expect(actions.deselectGeometryFromDeletionBasket).toHaveBeenCalledWith('g2');
    expect(actions.addGeometryToDeletionBasket).toHaveBeenCalledWith('g3');
    expect(actions.addGeometryToDeletionBasket).toHaveBeenCalledTimes(1);
  });

  it('ctrl click adds without clearing previous basket highlights', () => {
    const draft = linkGeoDraft({
      candidateGeometryIds: ['g1'],
      candidateLinkIds: ['l1'],
    });
    const actions = {
      addGeometryToDeletionBasket: vi.fn(() => ({ ok: true as const })),
      addLinkOnlyFromEndpoint: vi.fn(() => ({ ok: true as const })),
      deselectGeometryFromDeletionBasket: vi.fn(),
      reportDeletionSelectionBlocked: vi.fn(),
    };
    const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')];

    // previousSelectedIds lags (only last plain-click id) while basket still has g1.
    applyDeletionGeometryPicks(
      ['g1', 'g2'],
      draft,
      actions,
      {
        activeSocialLocks: [],
        currentStreamId: null,
        links,
        geometryIdsByDataId: {},
      },
      { toggle: true, previousSelectedIds: ['g1'], links },
    );

    expect(actions.deselectGeometryFromDeletionBasket).not.toHaveBeenCalled();
    expect(actions.addGeometryToDeletionBasket).toHaveBeenCalledWith('g2');
    expect(actions.addGeometryToDeletionBasket).toHaveBeenCalledTimes(1);
  });

  it('ctrl click removes only geometries dropped from the viewer selection', () => {
    const draft = linkGeoDraft({
      candidateGeometryIds: ['g1', 'g2'],
      candidateLinkIds: ['l1', 'l2'],
    });
    const actions = {
      addGeometryToDeletionBasket: vi.fn(() => ({ ok: true as const })),
      addLinkOnlyFromEndpoint: vi.fn(() => ({ ok: true as const })),
      deselectGeometryFromDeletionBasket: vi.fn(),
      reportDeletionSelectionBlocked: vi.fn(),
    };
    const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')];

    applyDeletionGeometryPicks(
      ['g1'],
      draft,
      actions,
      {
        activeSocialLocks: [],
        currentStreamId: null,
        links,
        geometryIdsByDataId: {},
      },
      { toggle: true, previousSelectedIds: ['g1', 'g2'], links },
    );

    expect(actions.deselectGeometryFromDeletionBasket).toHaveBeenCalledWith('g2');
    expect(actions.deselectGeometryFromDeletionBasket).toHaveBeenCalledTimes(1);
    expect(actions.addGeometryToDeletionBasket).not.toHaveBeenCalled();
  });
});
