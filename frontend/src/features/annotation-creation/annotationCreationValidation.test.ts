import { describe, expect, it } from 'vitest';
import type { AnnotationCreationDraft, CreatedGeometryDraft } from './types';
import { createDefaultCreationDraft } from './createDefaultCreationDraft';
import {
  allowsMultipleDataSelection,
  allowsMultipleGeometrySelection,
  buildLinkPairs,
  canAddMoreData,
  canAddMoreGeometry,
  canBeginCreationWizard,
  canCompleteDataStep,
  canCompleteGeometryStep,
  canSwitchToDataChoose,
  canSwitchToGeometryChoose,
  canUseDataChooseMode,
  geometryResultCount,
  isValidLinkCardinality,
  validateCreationDraftForCommit,
} from './annotationCreationValidation';

function pointGeo(viewerId: string): CreatedGeometryDraft {
  return {
    viewerId,
    shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
  };
}

function draft(overrides: Partial<AnnotationCreationDraft> = {}): AnnotationCreationDraft {
  return { ...createDefaultCreationDraft('scene-1'), ...overrides };
}

describe('annotationCreationValidation (batch)', () => {
  it('allows beginning when scopes are set', () => {
    expect(canBeginCreationWizard(draft())).toBe(true);
    expect(canBeginCreationWizard(draft({
      geometryScope: { referenceType: 'scene', referenceId: '' },
    }))).toBe(false);
  });

  it('always allows completing the geometry step', () => {
    expect(canCompleteGeometryStep(draft({ step: 'geometry' })).ok).toBe(true);
    expect(canCompleteGeometryStep(draft({
      step: 'geometry',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
    })).ok).toBe(true);
  });

  it('requires created data when geometry was skipped', () => {
    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: null,
      dataMode: 'new',
      createdData: [],
    })).ok).toBe(false);

    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: null,
      dataMode: 'choose',
      selectedDataIds: ['d1'],
    })).ok).toBe(false);

    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: null,
      dataMode: 'new',
      createdData: [{ label: 'Note', description: '', class: null, content: {} }],
    })).ok).toBe(true);
  });

  it('allows geometry-only when geometries were created', () => {
    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1'), pointGeo('v2')],
      dataMode: null,
    })).ok).toBe(true);
  });

  it('requires data once New or Choose was entered on the data step', () => {
    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
      dataMode: 'new',
      createdData: [],
    })).ok).toBe(false);

    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
      dataMode: 'choose',
      selectedDataIds: [],
    })).ok).toBe(false);
  });

  it('requires data when geometries were only chosen', () => {
    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'choose',
      selectedGeometryIds: ['g1'],
      dataMode: null,
    })).ok).toBe(false);

    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'choose',
      selectedGeometryIds: ['g1', 'g2'],
      dataMode: 'new',
      createdData: [{ label: 'Shared', description: '', class: null, content: {} }],
    })).ok).toBe(true);
  });

  it('rejects N>1 and K>1', () => {
    expect(canCompleteDataStep(draft({
      step: 'data',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1'), pointGeo('v2')],
      dataMode: 'new',
      createdData: [
        { label: 'A', description: '', class: null, content: {} },
        { label: 'B', description: '', class: null, content: {} },
      ],
    })).ok).toBe(false);
  });

  it('disables geometry choose after creations exist', () => {
    expect(canSwitchToGeometryChoose(draft())).toBe(true);
    expect(canSwitchToGeometryChoose(draft({
      createdGeometries: [pointGeo('v1')],
    }))).toBe(false);
  });

  it('disables data choose when no geometries (geometry-first)', () => {
    expect(canUseDataChooseMode(draft())).toBe(false);
    expect(canUseDataChooseMode(draft({
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
    }))).toBe(true);
  });

  it('allows data choose on the first step when data-first', () => {
    expect(canUseDataChooseMode(draft({
      stepOrder: 'data-first',
      step: 'data',
    }))).toBe(true);
  });

  it('mirrors Done rules for data-first order', () => {
    // First step (data) always advances.
    expect(canCompleteDataStep(draft({
      stepOrder: 'data-first',
      step: 'data',
      dataMode: null,
    })).ok).toBe(true);

    // Second step (geometry): data-only when geometry mode unset.
    expect(canCompleteGeometryStep(draft({
      stepOrder: 'data-first',
      step: 'geometry',
      dataMode: 'new',
      createdData: [{ label: 'Note', description: '', class: null, content: {} }],
      geometryMode: null,
    })).ok).toBe(true);

    // Chosen data requires geometry.
    expect(canCompleteGeometryStep(draft({
      stepOrder: 'data-first',
      step: 'geometry',
      dataMode: 'choose',
      selectedDataIds: ['d1'],
      geometryMode: null,
    })).ok).toBe(false);

    expect(canCompleteGeometryStep(draft({
      stepOrder: 'data-first',
      step: 'geometry',
      dataMode: 'choose',
      selectedDataIds: ['d1'],
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
    })).ok).toBe(true);
  });

  it('limits further geometry when multiple data exist', () => {
    const multiData = draft({
      stepOrder: 'data-first',
      dataMode: 'new',
      createdData: [
        { label: 'A', description: '', class: null, content: {} },
        { label: 'B', description: '', class: null, content: {} },
      ],
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
    });
    expect(canAddMoreGeometry(multiData)).toBe(false);
    expect(allowsMultipleGeometrySelection({ ...multiData, geometryMode: 'choose' })).toBe(false);
  });

  it('limits further data when multiple geometries exist', () => {
    const multiGeo = draft({
      geometryMode: 'choose',
      selectedGeometryIds: ['g1', 'g2'],
      dataMode: 'new',
      createdData: [{ label: 'One', description: '', class: null, content: {} }],
    });
    expect(canAddMoreData(multiGeo)).toBe(false);
    expect(allowsMultipleDataSelection({ ...multiGeo, dataMode: 'choose' })).toBe(false);
  });

  it('ignores pending form values when deciding if more data can be added', () => {
    expect(canAddMoreData(draft({
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1'), pointGeo('v2')],
      dataMode: 'new',
      createdData: [],
      pendingDataLabel: 'Still typing',
    }))).toBe(true);

    expect(canAddMoreData(draft({
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
      dataMode: 'new',
      createdData: [],
      pendingDataLabel: 'Anything',
    }))).toBe(true);
  });

  it('disables data choose after created data exists', () => {
    expect(canSwitchToDataChoose(draft())).toBe(true);
    expect(canSwitchToDataChoose(draft({
      createdData: [{ label: 'One', description: '', class: null, content: {} }],
    }))).toBe(false);
  });

  it('allows multi geometry choose', () => {
    expect(allowsMultipleGeometrySelection(draft({ geometryMode: 'choose' }))).toBe(true);
    expect(allowsMultipleGeometrySelection(draft({ geometryMode: 'new' }))).toBe(false);
  });

  it('counts geometry results from the active mode', () => {
    expect(geometryResultCount(draft({
      geometryMode: 'new',
      createdGeometries: [pointGeo('a'), pointGeo('b')],
      selectedGeometryIds: ['ignored'],
    }))).toBe(2);
    expect(geometryResultCount(draft({
      geometryMode: 'choose',
      selectedGeometryIds: ['g1'],
      createdGeometries: [pointGeo('ignored')],
    }))).toBe(1);
  });

  it('builds cartesian link pairs and checks cardinality', () => {
    expect(buildLinkPairs(['g1', 'g2'], ['d1'])).toEqual([
      { geometryId: 'g1', dataId: 'd1' },
      { geometryId: 'g2', dataId: 'd1' },
    ]);
    expect(isValidLinkCardinality(2, 2)).toBe(false);
    expect(isValidLinkCardinality(2, 1)).toBe(true);
    expect(isValidLinkCardinality(0, 3)).toBe(true);
  });

  it('validates commit end-states a/b/c', () => {
    // (a) 0 geo, K≥1 data
    expect(validateCreationDraftForCommit(draft({
      step: 'data',
      dataMode: 'new',
      createdData: [{ label: 'Only data', description: '', class: null, content: {} }],
    })).ok).toBe(true);

    // (b) N≥1 created geo, K=0
    expect(validateCreationDraftForCommit(draft({
      step: 'data',
      geometryMode: 'new',
      createdGeometries: [pointGeo('v1')],
    })).ok).toBe(true);

    // chosen geos without data — invalid
    expect(validateCreationDraftForCommit(draft({
      step: 'data',
      geometryMode: 'choose',
      selectedGeometryIds: ['g1'],
    })).ok).toBe(false);

    // (c) N×K with N=1 or K=1
    expect(validateCreationDraftForCommit(draft({
      step: 'data',
      geometryMode: 'choose',
      selectedGeometryIds: ['g1', 'g2'],
      dataMode: 'choose',
      selectedDataIds: ['d1'],
    })).ok).toBe(true);
  });
});
