import { describe, expect, it } from 'vitest';
import type { AnnotationCreationDraft } from './types';
import { createDefaultCreationDraft } from './createDefaultCreationDraft';
import {
  allowsMultipleDataSelection,
  allowsMultipleGeometrySelection,
  buildLinkPairs,
  bothSidesSearch,
  bothSidesVoid,
  canBeginCreationWizard,
  normalizeMultiSideForChoices,
  resolveInitialCreationStep,
  validateCreationDraftForCommit,
  validateCreationSetup,
  validateCreationStep,
} from './annotationCreationValidation';

function draft(overrides: Partial<AnnotationCreationDraft> = {}): AnnotationCreationDraft {
  return { ...createDefaultCreationDraft('scene-1'), ...overrides };
}

describe('annotationCreationValidation', () => {
  it('rejects when both sides are void', () => {
    const setup = draft({ geometryChoice: 'void', dataChoice: 'void' });
    expect(bothSidesVoid(setup)).toBe(true);
    expect(validateCreationSetup(setup).ok).toBe(false);
    expect(canBeginCreationWizard(setup)).toBe(false);
  });

  it('requires multi-side when both sides search', () => {
    const setup = draft({
      geometryChoice: 'search',
      dataChoice: 'search',
      multiSide: null,
    });
    expect(bothSidesSearch(setup)).toBe(true);
    expect(validateCreationSetup(setup).ok).toBe(false);
  });

  it('resolves initial step from geometry void', () => {
    expect(resolveInitialCreationStep({ geometryChoice: 'void', dataChoice: 'new' })).toBe('data');
    expect(resolveInitialCreationStep({ geometryChoice: 'new', dataChoice: 'void' })).toBe('geometry');
  });

  it('normalizes multi-side only when both search', () => {
    expect(normalizeMultiSideForChoices('search', 'search', 'data')).toBe('data');
    expect(normalizeMultiSideForChoices('new', 'search', 'geometry')).toBeNull();
  });

  it('enforces single vs multi geometry selection', () => {
    const bothSearchGeometryMulti = draft({
      geometryChoice: 'search',
      dataChoice: 'search',
      multiSide: 'geometry',
    });
    expect(allowsMultipleGeometrySelection(bothSearchGeometryMulti)).toBe(true);
    expect(allowsMultipleDataSelection(bothSearchGeometryMulti)).toBe(false);

    const geometryOnlySearch = draft({ geometryChoice: 'search', dataChoice: 'new', multiSide: null });
    expect(allowsMultipleGeometrySelection(geometryOnlySearch)).toBe(true);
  });

  it('validates geometry step requirements', () => {
    expect(
      validateCreationStep(
        draft({ step: 'geometry', geometryChoice: 'new', draftShapes: [] }),
      ).ok,
    ).toBe(false);
    expect(
      validateCreationStep(
        draft({
          step: 'geometry',
          geometryChoice: 'new',
          draftShapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
        }),
      ).ok,
    ).toBe(true);
    expect(
      validateCreationStep(
        draft({ step: 'geometry', geometryChoice: 'search', selectedGeometryIds: [] }),
      ).ok,
    ).toBe(false);
  });

  it('validates data step requirements', () => {
    expect(
      validateCreationStep(
        draft({ step: 'data', dataChoice: 'new', newDataLabel: '  ' }),
      ).ok,
    ).toBe(false);
    expect(
      validateCreationStep(
        draft({ step: 'data', dataChoice: 'new', newDataLabel: 'Label' }),
      ).ok,
    ).toBe(true);
  });

  it('builds cartesian link pairs', () => {
    expect(buildLinkPairs(['g1', 'g2'], ['d1'])).toEqual([
      { geometryId: 'g1', dataId: 'd1' },
      { geometryId: 'g2', dataId: 'd1' },
    ]);
  });

  it('validates commit for geometry-only void data', () => {
    const geometryOnly = draft({
      step: 'data',
      geometryChoice: 'new',
      dataChoice: 'void',
      draftShapes: [{ type: 'ShapePoints', vertices: [[1, 2, 0]] }],
    });
    expect(validateCreationDraftForCommit(geometryOnly).ok).toBe(true);
  });

  it('validates commit for data-only void geometry', () => {
    const dataOnly = draft({
      step: 'data',
      geometryChoice: 'void',
      dataChoice: 'new',
      newDataLabel: 'Fragment',
    });
    expect(validateCreationDraftForCommit(dataOnly).ok).toBe(true);
  });

  it('validates link-only search commit', () => {
    const linkOnly = draft({
      step: 'data',
      geometryChoice: 'search',
      dataChoice: 'search',
      multiSide: 'geometry',
      selectedGeometryIds: ['g1'],
      selectedDataIds: ['d1'],
    });
    expect(validateCreationDraftForCommit(linkOnly).ok).toBe(true);
  });
});
