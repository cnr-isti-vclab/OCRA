import { describe, expect, it } from 'vitest';
import type { AnnotationData, AnnotationGeometry } from 'shared/annotation-types';
import { createEmptyActiveSelection } from '../../stores/annotation-selection';
import { applyAnnotationLinkViewMode } from './annotationLinkViewMode';

const geometry = (id: string): AnnotationGeometry => ({
  id,
  projectId: 'p1',
  shapes: [],
  referenceType: 'scene',
  referenceId: 'scene-1',
  version: 0,
  createdAt: '',
  createdBy: 'u1',
  updatedAt: '',
  updatedBy: '',
  erasableAt: null,
  erasableBy: null,
});

const datum = (id: string): AnnotationData => ({
  id,
  projectId: 'p1',
  label: id,
  description: '',
  class: null,
  content: {},
  visibilityType: 'scene',
  visibilityId: 'scene-1',
  version: 0,
  createdAt: '',
  createdBy: 'u1',
  updatedAt: '',
  updatedBy: '',
  erasableAt: null,
  erasableBy: null,
});

describe('applyAnnotationLinkViewMode', () => {
  const activeGeometries = [geometry('g1'), geometry('g2')];
  const activeData = [datum('d1'), datum('d2')];
  const selection = {
    ...createEmptyActiveSelection(),
    geometryIdsByDataId: new Map([
      ['d1', ['g1']],
      ['d2', ['g2']],
    ]),
    dataIdsByGeometryId: new Map([
      ['g1', ['d1']],
      ['g2', ['d2']],
    ]),
  };

  it('shows all active sets in showAll mode', () => {
    const result = applyAnnotationLinkViewMode({
      mode: 'showAll',
      activeGeometries,
      activeData,
      selection,
      focusedGeometryIds: new Set(),
      focusedDataIds: new Set(),
    });
    expect(result.visibleGeometries.map((item) => item.id)).toEqual(['g1', 'g2']);
    expect(result.visibleData.map((item) => item.id)).toEqual(['d1', 'd2']);
  });

  it('filters panel data by focused geometry in selectGeometry mode', () => {
    const result = applyAnnotationLinkViewMode({
      mode: 'selectGeometry',
      activeGeometries,
      activeData,
      selection,
      focusedGeometryIds: new Set(['g1']),
      focusedDataIds: new Set(),
    });
    expect(result.visibleGeometries.map((item) => item.id)).toEqual(['g1', 'g2']);
    expect(result.visibleData.map((item) => item.id)).toEqual(['d1']);
  });

  it('filters viewer geometries by focused data in selectData mode', () => {
    const result = applyAnnotationLinkViewMode({
      mode: 'selectData',
      activeGeometries,
      activeData,
      selection,
      focusedGeometryIds: new Set(),
      focusedDataIds: new Set(['d2']),
    });
    expect(result.visibleGeometries.map((item) => item.id)).toEqual(['g2']);
    expect(result.visibleData.map((item) => item.id)).toEqual(['d1', 'd2']);
  });

  it('uses data focus as fallback anchor when switching to selectGeometry', () => {
    const result = applyAnnotationLinkViewMode({
      mode: 'selectGeometry',
      activeGeometries,
      activeData,
      selection,
      focusedGeometryIds: new Set(),
      focusedDataIds: new Set(['d2']),
    });
    expect(result.visibleData.map((item) => item.id)).toEqual(['d2']);
  });
});
