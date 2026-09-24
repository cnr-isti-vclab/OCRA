import { describe, expect, it } from 'vitest';
import { createDefaultCreationDraft } from './createDefaultCreationDraft';
import {
  applyRememberedCreationSetup,
  extractCreationSetup,
  patchTouchesCreationSetup,
} from './rememberCreationSetup';

describe('rememberCreationSetup', () => {
  it('extracts and reapplies setup fields without wizard state', () => {
    const base = createDefaultCreationDraft('scene-a');
    const patched = {
      ...base,
      step: 'geometry' as const,
      geometryMode: 'choose' as const,
      dataMode: null,
      selectedGeometryIds: ['g1'],
      createdGeometries: [{ viewerId: 'v1', shapes: [{ type: 'ShapePoints' as const, vertices: [[0, 0, 0]] }] }],
      drawingMode: 'point' as const,
    };

    const remembered = extractCreationSetup(patched);
    expect(remembered.drawingMode).toBe('point');
    expect('selectedGeometryIds' in remembered).toBe(false);
    expect('geometryMode' in remembered).toBe(false);

    const next = applyRememberedCreationSetup(createDefaultCreationDraft('scene-b'), remembered);
    expect(next.drawingMode).toBe('point');
    expect(next.step).toBe('geometry');
    expect(next.selectedGeometryIds).toEqual([]);
    expect(next.geometryMode).toBeNull();
  });

  it('detects setup-touching patches', () => {
    expect(patchTouchesCreationSetup({ pendingDataLabel: 'x' })).toBe(false);
    expect(patchTouchesCreationSetup({ drawingMode: 'line' })).toBe(true);
    expect(patchTouchesCreationSetup({ geometryScope: { referenceType: 'asset', referenceId: 'a1' } })).toBe(true);
  });
});
