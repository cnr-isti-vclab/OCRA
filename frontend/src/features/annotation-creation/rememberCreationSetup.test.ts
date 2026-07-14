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
      geometryChoice: 'search' as const,
      dataChoice: 'void' as const,
      selectedGeometryIds: ['g1'],
      draftShapes: [{ type: 'ShapePoints' as const, vertices: [[0, 0, 0]] }],
    };

    const remembered = extractCreationSetup(patched);
    expect(remembered.geometryChoice).toBe('search');
    expect(remembered.dataChoice).toBe('void');
    expect(remembered.selectedGeometryIds).toBeUndefined();

    const next = applyRememberedCreationSetup(createDefaultCreationDraft('scene-b'), remembered);
    expect(next.geometryChoice).toBe('search');
    expect(next.dataChoice).toBe('void');
    expect(next.step).toBe('setup');
    expect(next.selectedGeometryIds).toEqual([]);
  });

  it('detects setup-touching patches', () => {
    expect(patchTouchesCreationSetup({ newDataLabel: 'x' })).toBe(false);
    expect(patchTouchesCreationSetup({ geometryChoice: 'void' })).toBe(true);
    expect(patchTouchesCreationSetup({ geometryScope: { referenceType: 'asset', referenceId: 'a1' } })).toBe(true);
  });
});
