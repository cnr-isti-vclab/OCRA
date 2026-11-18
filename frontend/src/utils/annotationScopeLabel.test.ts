import { describe, expect, it } from 'vitest';
import { formatAnnotationScopeLabel } from './annotationScopeLabel';

describe('formatAnnotationScopeLabel', () => {
  it('labels scene scope with optional scene name', () => {
    expect(formatAnnotationScopeLabel({ type: 'scene', id: 'scene-1' })).toEqual({
      text: 'Scene',
      title: 'Scene · scene-1',
    });
    expect(formatAnnotationScopeLabel({
      type: 'scene',
      id: 'scene-1',
      sceneLabel: 'Courtyard',
    })).toEqual({
      text: 'Courtyard',
      title: 'Scene · scene-1',
    });
  });

  it('prefers asset label over raw id', () => {
    expect(formatAnnotationScopeLabel({
      type: 'asset',
      id: 'urn:asset:coin',
      assets: [{ id: 'urn:asset:coin', label: 'Coin RTI' }],
    })).toEqual({
      text: 'Coin RTI',
      title: 'Asset · urn:asset:coin',
    });
    expect(formatAnnotationScopeLabel({ type: 'asset', id: 'urn:asset:coin' })).toEqual({
      text: 'urn:asset:coin',
      title: 'Asset · urn:asset:coin',
    });
  });
});
