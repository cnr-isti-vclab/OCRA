import { describe, expect, it } from 'vitest';
import type { ViewerAnnotation } from 'shared/scene-types';
import {
  syncOpenLimeAnnotations,
  type OpenLimeAnnotationManager,
  type OpenLimeSyncedAnnotation,
} from './openlimeAnnotationAdapter';

describe('OpenLIME label parts sync', () => {
  it('adds and removes presentation badges without changing geometry or the plain label', () => {
    const existing: OpenLimeSyncedAnnotation = {
      id: 'geometry-1',
      type: 'point',
      label: 'Lacuna',
      data: { _x: 10, _y: 20 },
    };
    let redraws = 0;
    let deletions = 0;
    const manager: OpenLimeAnnotationManager = {
      mode: 'edit',
      viewer: { redraw: () => { redraws += 1; } },
      getAnnotations: () => [{ id: existing.id }],
      getAnnotationById: (id) => id === existing.id ? existing : null,
      deleteAnnotation: () => { deletions += 1; },
      importAnnotations: () => {},
      setMode: (mode) => mode,
      deselectAll: () => {},
      setSelected: () => {},
    };
    const annotation: ViewerAnnotation = {
      id: existing.id,
      type: 'point',
      geometry: [10, 20, 0],
      label: 'Lacuna',
      labelParts: [
        { type: 'badge', text: 'G2' },
        { type: 'text', text: ' Lacuna' },
        { type: 'break' },
        { type: 'badge', text: 'D4' },
        { type: 'text', text: ' Detail' },
      ],
    };

    syncOpenLimeAnnotations(manager, [annotation]);
    expect(existing.label).toBe('Lacuna');
    expect(existing.labelParts).toEqual(annotation.labelParts);
    expect(redraws).toBe(1);
    expect(deletions).toBe(0);

    syncOpenLimeAnnotations(manager, [annotation]);
    expect(redraws).toBe(1);

    syncOpenLimeAnnotations(manager, [{ ...annotation, labelParts: undefined }]);
    expect(existing.labelParts).toBeUndefined();
    expect(existing.label).toBe('Lacuna');
    expect(redraws).toBe(2);
    expect(deletions).toBe(0);
  });
});
