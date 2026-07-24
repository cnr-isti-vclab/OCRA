import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { buildDeletionCommitPlan } from './buildDeletionCommitPlan';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';
import { formatDeletionCommitError } from './formatDeletionCommitError';
import { pruneLockedFromDeletionBasket } from './pruneLockedFromDeletionBasket';
import { AnnotationApiError } from '../../services/AnnotationApiClient';

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
    version: 1,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  };
}

describe('buildDeletionCommitPlan', () => {
  it('orders links before geometries before data', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
      candidateLinkIds: ['l1'],
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d1'],
    };
    const l1 = link('l1', 'g1', 'd1');
    const result = buildDeletionCommitPlan(draft, {
      getLink: (id) => (id === 'l1' ? l1 : undefined),
      getGeometry: (id) => (id === 'g1'
        ? {
          id: 'g1',
          projectId: 'p1',
          shapes: [],
          referenceType: 'scene',
          referenceId: 's1',
          version: 2,
          erasableAt: null,
          erasableBy: null,
          createdAt: l1.createdAt,
          createdBy: 'u1',
          updatedAt: l1.updatedAt,
          updatedBy: 'u1',
        }
        : undefined),
      getData: (id) => (id === 'd1'
        ? {
          id: 'd1',
          projectId: 'p1',
          label: 'L',
          description: '',
          class: null,
          content: {},
          visibilityType: 'scene',
          visibilityId: 's1',
          version: 3,
          erasableAt: null,
          erasableBy: null,
          createdAt: l1.createdAt,
          createdBy: 'u1',
          updatedAt: l1.updatedAt,
          updatedBy: 'u1',
        }
        : undefined),
      links: [l1],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.items.map((item) => item.kind)).toEqual(['link', 'geometry', 'data']);
    expect(result.plan.items.map((item) => item.expectedVersion)).toEqual([1, 2, 3]);
  });
});

describe('formatDeletionCommitError', () => {
  it('maps still_linked codes', () => {
    expect(formatDeletionCommitError(new AnnotationApiError(
      'still linked',
      409,
      'annotation.geometry.still_linked',
    ))).toMatch(/still linked outside/i);
  });
});

describe('pruneLockedFromDeletionBasket', () => {
  it('removes a locked geometry and its basket links', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      candidateGeometryIds: ['g1', 'g2'],
      candidateLinkIds: ['l1', 'l2'],
    };
    const links = [link('l1', 'g1', 'd1'), link('l2', 'g2', 'd2')];
    const result = pruneLockedFromDeletionBasket(draft, {
      activeSocialLocks: [{
        streamId: 'other',
        userId: 'u2',
        username: 'Other',
        lockKind: 'editor',
        resourceType: 'geometry',
        resourceId: 'g1',
        projectId: 'p1',
        sceneId: 's1',
        sessionId: 'sess-other',
        activity: 'edit',
        startedAt: '2026-01-01T00:00:00.000Z',
        impact: { affectedSceneIds: ['s1'], affectedAssetIds: [] },
      }],
      currentStreamId: 'mine',
      links,
      geometryIdsByDataId: new Map([
        ['d1', ['g1']],
        ['d2', ['g2']],
      ]),
    });
    expect(result.removedGeometryIds).toEqual(['g1']);
    expect(result.removedLinkIds).toEqual(['l1']);
    expect(result.draft.candidateGeometryIds).toEqual(['g2']);
    expect(result.draft.candidateLinkIds).toEqual(['l2']);
    expect(result.skipMessage).toMatch(/Skipped/i);
  });
});
