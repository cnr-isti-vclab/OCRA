import { describe, expect, it } from 'vitest';
import type { AnnotationLink } from 'shared/annotation-types';
import { createDefaultDeletionDraft } from './createDefaultDeletionDraft';
import {
  resolveDeletionLinkViewFocus,
  resolveDeletionLinkViewMode,
} from './annotationDeletionCardinality';

describe('resolveDeletionLinkViewMode', () => {
  it('uses selectGeometry for Link+Geo', () => {
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    })).toBe('selectGeometry');
  });

  it('uses selectData for Link+Data', () => {
    expect(resolveDeletionLinkViewMode({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
    })).toBe('selectData');
  });

  it('uses showAll for link-only and full triplet', () => {
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
  it('anchors geometry focus for Link+Geo', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
      candidateGeometryIds: ['g1', 'g2'],
      candidateDataIds: [],
    };
    const focus = resolveDeletionLinkViewFocus(draft);
    expect(focus).not.toBeNull();
    expect([...focus!.focusedGeometryIds]).toEqual(['g1', 'g2']);
    expect([...focus!.focusedDataIds]).toEqual([]);
  });

  it('anchors data focus for Link+Data', () => {
    const draft = {
      ...createDefaultDeletionDraft(),
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
      candidateGeometryIds: [],
      candidateDataIds: ['d1'],
    };
    const focus = resolveDeletionLinkViewFocus(draft);
    expect(focus).not.toBeNull();
    expect([...focus!.focusedDataIds]).toEqual(['d1']);
    expect([...focus!.focusedGeometryIds]).toEqual([]);
  });

  it('returns null for link-only and full triplet', () => {
    const base = createDefaultDeletionDraft();
    expect(resolveDeletionLinkViewFocus({
      ...base,
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d1'],
    })).toBeNull();
    expect(resolveDeletionLinkViewFocus({
      ...base,
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
      candidateGeometryIds: ['g1'],
      candidateDataIds: ['d1'],
    })).toBeNull();
  });
});
