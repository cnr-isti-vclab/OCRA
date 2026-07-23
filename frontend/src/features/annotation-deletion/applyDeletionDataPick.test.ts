import { describe, expect, it, vi } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { applyDeletionDataPick } from './applyDeletionDataPick';
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

describe('applyDeletionDataPick', () => {
  it('ignores data picks in Link+Geo mode (counterpart highlight only)', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
      candidateGeometryIds: ['g1'],
      candidateLinkIds: ['l1'],
    };
    const actions = {
      addDataToDeletionBasket: vi.fn(() => ({ ok: true as const })),
      addLinkOnlyFromEndpoint: vi.fn(() => ({ ok: true as const })),
      deselectDataFromDeletionBasket: vi.fn(),
      reportDeletionSelectionBlocked: vi.fn(),
    };
    const links = [link('l1', 'g1', 'd1')];

    applyDeletionDataPick(
      'd1',
      draft,
      actions,
      {
        activeSocialLocks: [],
        currentStreamId: null,
        links,
        geometryIdsByDataId: new Map(),
      },
      { toggle: true, links },
    );

    expect(actions.deselectDataFromDeletionBasket).not.toHaveBeenCalled();
    expect(actions.addDataToDeletionBasket).not.toHaveBeenCalled();
  });

  it('plain click replaces previous data selection in Link+Data mode', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
      candidateDataIds: ['d1'],
      candidateLinkIds: ['l1'],
    };
    const actions = {
      addDataToDeletionBasket: vi.fn(() => ({ ok: true as const })),
      addLinkOnlyFromEndpoint: vi.fn(() => ({ ok: true as const })),
      deselectDataFromDeletionBasket: vi.fn(),
      reportDeletionSelectionBlocked: vi.fn(),
    };
    const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')];

    applyDeletionDataPick(
      'd2',
      draft,
      actions,
      {
        activeSocialLocks: [],
        currentStreamId: null,
        links,
        geometryIdsByDataId: new Map(),
      },
      { toggle: false, links },
    );

    expect(actions.deselectDataFromDeletionBasket).toHaveBeenCalledWith('d1');
    expect(actions.addDataToDeletionBasket).toHaveBeenCalledWith('d2');
  });
});
