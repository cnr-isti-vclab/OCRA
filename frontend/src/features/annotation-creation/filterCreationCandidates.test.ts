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

const datum = (id: string, visibilityId: string, erasableAt: string | null = null): AnnotationData => ({
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
  erasableAt,
  erasableBy: erasableAt ? 'u1' : null,
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

  it('excludes erasable data and geometries by default', () => {
    const draft = createDefaultCreationDraft('scene-1');
    expect(
      filterDataForCreationSearch(
        [datum('d-active', 'scene-1'), datum('d-erased', 'scene-1', '2026-01-01T00:00:00.000Z')],
        draft,
      ).map((item) => item.id),
    ).toEqual(['d-active']);
    expect(
      filterGeometriesForCreationSearch(
        [
          { ...geometry('g-active', 'scene-1') },
          { ...geometry('g-erased', 'scene-1'), erasableAt: '2026-01-01T00:00:00.000Z', erasableBy: 'u1' },
        ],
        draft,
      ).map((item) => item.id),
    ).toEqual(['g-active']);
  });

  it('can include erasable entities when requested', () => {
    const draft = createDefaultCreationDraft('scene-1');
    expect(
      filterDataForCreationSearch(
        [datum('d-erased', 'scene-1', '2026-01-01T00:00:00.000Z')],
        draft,
        { includeErasable: true },
      ).map((item) => item.id),
    ).toEqual(['d-erased']);
  });
});
