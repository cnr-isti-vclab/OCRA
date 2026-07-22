import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { canConfirmDeletionBasket, validateDeletionBasket } from './annotationDeletionBasket';
import {
  isOneToManyLinks,
  nonErasableLinksForData,
  nonErasableLinksForGeometry,
  resolveDeletionLinkViewFocus,
  resolveDeletionLinkViewMode,
} from './annotationDeletionCardinality';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';

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

describe('resolveDeletionLinkViewMode', () => {
  it('maps intent to link view modes', () => {
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    })).toBe('selectGeometry');
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
    })).toBe('selectData');
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
    })).toBe('showAll');
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
    })).toBe('showAll');
  });
});

describe('resolveDeletionLinkViewFocus', () => {
  it('anchors Link+Geo on basket geometries', () => {
    expect(resolveDeletionLinkViewFocus({
      deleteGeometry: true,
      deleteData: false,
      candidateGeometryIds: ['g1', 'g2'],
      candidateDataIds: ['d-ignored'],
    })).toEqual({
      focusedGeometryIds: new Set(['g1', 'g2']),
      focusedDataIds: new Set(),
    });
  });

  it('anchors Link+Data on basket data', () => {
    expect(resolveDeletionLinkViewFocus({
      deleteGeometry: false,
      deleteData: true,
      candidateGeometryIds: ['g-ignored'],
      candidateDataIds: ['d1'],
    })).toEqual({
      focusedGeometryIds: new Set(),
      focusedDataIds: new Set(['d1']),
    });
  });

  it('returns null for showAll intents', () => {
    expect(resolveDeletionLinkViewFocus({
      deleteGeometry: false,
      deleteData: false,
      candidateGeometryIds: [],
      candidateDataIds: [],
    })).toBeNull();
    expect(resolveDeletionLinkViewFocus({
      deleteGeometry: true,
      deleteData: true,
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d1'],
    })).toBeNull();
  });
});

describe('annotationDeletionCardinality', () => {
  it('filters non-erasable links per endpoint', () => {
    const links = [
      link('l1', 'g1', 'd1'),
      link('l2', 'g1', 'd2', '2026-01-02T00:00:00.000Z'),
      link('l3', 'g2', 'd1'),
    ];
    expect(nonErasableLinksForGeometry(links, 'g1').map((entry) => entry.id)).toEqual(['l1']);
    expect(nonErasableLinksForData(links, 'd1').map((entry) => entry.id)).toEqual(['l1', 'l3']);
    expect(isOneToManyLinks(nonErasableLinksForData(links, 'd1'))).toBe(true);
  });
});

describe('validateDeletionBasket', () => {
  it('rejects empty basket while selecting', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
    };
    expect(validateDeletionBasket(draft, { links: [] }).ok).toBe(false);
  });

  it('accepts link-only basket with links and no endpoints', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      candidateLinkIds: ['l1'],
    };
    expect(canConfirmDeletionBasket(draft, {
      links: [link('l1', 'g1', 'd1')],
    })).toBe(true);
  });

  it('accepts geometry + link 1:1 basket', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      candidateGeometryIds: ['g1'],
      candidateLinkIds: ['l1'],
    };
    expect(validateDeletionBasket(draft, {
      links: [link('l1', 'g1', 'd1')],
    }).ok).toBe(true);
  });

  it('rejects geometry basket missing its link', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      deleteGeometry: true,
      candidateGeometryIds: ['g1'],
      candidateLinkIds: [],
    };
    expect(validateDeletionBasket(draft, {
      links: [link('l1', 'g1', 'd1')],
    }).ok).toBe(false);
  });

  it('rejects link-only basket that still has endpoints', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      step: 'selecting' as const,
      deleteLink: true,
      candidateLinkIds: ['l1'],
      candidateGeometryIds: ['g1'],
    };
    expect(validateDeletionBasket(draft, {
      links: [link('l1', 'g1', 'd1')],
    }).ok).toBe(false);
  });
});
