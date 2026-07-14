import { describe, expect, it } from 'vitest';
import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import { createDefaultCreationDraft } from './createDefaultCreationDraft';
import { filterDataForCreationSearch, filterGeometriesForCreationSearch } from './filterCreationCandidates';

const geometry = (id: string, referenceId: string): AnnotationGeometry => ({
  id,
  projectId: 'p1',
  shapes: [],
  referenceType: 'scene',
  referenceId,
  version: 0,
  createdAt: '',
  createdBy: 'u1',
  updatedAt: '',
  updatedBy: '',
  erasableAt: null,
  erasableBy: null,
});

const datum = (id: string, visibilityId: string): AnnotationData => ({
  id,
  projectId: 'p1',
  label: id,
  description: '',
  class: null,
  content: {},
  visibilityType: 'scene',
  visibilityId,
  version: 0,
  createdAt: '',
  createdBy: 'u1',
  updatedAt: '',
  updatedBy: '',
  erasableAt: null,
  erasableBy: null,
});

describe('filterCreationCandidates', () => {
  it('filters geometries and data by draft scope', () => {
    const draft = createDefaultCreationDraft('scene-1');
    expect(
      filterGeometriesForCreationSearch(
        [geometry('g1', 'scene-1'), geometry('g2', 'scene-2')],
        draft,
      ).map((item) => item.id),
    ).toEqual(['g1']);
    expect(
      filterDataForCreationSearch(
        [datum('d1', 'scene-1'), datum('d2', 'scene-2')],
        draft,
      ).map((item) => item.id),
    ).toEqual(['d1']);
  });
});
