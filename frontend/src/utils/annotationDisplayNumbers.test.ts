import { describe, expect, it } from 'vitest';
import type { AnnotationData } from 'shared/annotation-types';
import type { ViewerAnnotation } from 'shared/scene-types';
import { withWorkbenchDisplayNumbers } from '../adapters/annotation-store/geometryToViewerAnnotation';
import { createEmptyActiveSelection } from '../stores/annotation-selection';
import { buildAnnotationDisplayNumbers, orderByAnnotationDisplayNumber } from './annotationDisplayNumbers';

describe('annotation display numbers', () => {
  it('uses creation order with an id tie-breaker and excludes erased records', () => {
    const numbers = buildAnnotationDisplayNumbers([
      { id: 'g-c', createdAt: '2026-01-02T00:00:00.000Z', erasableAt: null },
      { id: 'g-b', createdAt: '2026-01-01T00:00:00.000Z', erasableAt: null },
      { id: 'g-erased', createdAt: '2025-01-01T00:00:00.000Z', erasableAt: '2026-01-03T00:00:00.000Z' },
      { id: 'g-a', createdAt: '2026-01-01T00:00:00.000Z', erasableAt: null },
    ]);

    expect([...numbers.entries()]).toEqual([['g-a', 1], ['g-b', 2], ['g-c', 3]]);
    expect(numbers.get('g-c')).toBe(3); // Filtering a list never renumbers its rows.
    expect(orderByAnnotationDisplayNumber([{ id: 'g-c' }, { id: 'g-a' }], numbers))
      .toEqual([{ id: 'g-a' }, { id: 'g-c' }]);
  });

  it('decorates only the rendering label with geometry and linked-data numbers', () => {
    const annotation: ViewerAnnotation = {
      id: 'g-1',
      label: 'Lacuna | Crack',
      type: 'point',
      geometry: [0, 0, 0],
    };
    const datum = (id: string, label: string): AnnotationData => ({
      id,
      label,
      projectId: 'project',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'user',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'user',
      version: 0,
      erasableAt: null,
      erasableBy: null,
    });
    const selection = {
      ...createEmptyActiveSelection(),
      dataById: new Map([
        ['d-1', datum('d-1', 'Lacuna')],
        ['d-2', datum('d-2', 'Crack')],
      ]),
      dataIdsByGeometryId: new Map([['g-1', ['d-1', 'd-2']]]),
    };

    const decorated = withWorkbenchDisplayNumbers(
      [annotation],
      selection,
      new Map([['g-1', 3]]),
      new Map([['d-1', 2], ['d-2', 5]]),
    );

    expect(decorated[0].label).toBe('Lacuna | Crack');
    expect(decorated[0].labelParts).toEqual([
      { type: 'badge', text: 'G3' },
      { type: 'text', text: ' ' },
      { type: 'badge', text: 'D2' },
      { type: 'text', text: ' Lacuna' },
      { type: 'break' },
      { type: 'badge', text: 'D5' },
      { type: 'text', text: ' Crack' },
    ]);
    expect(annotation.label).toBe('Lacuna | Crack');
    expect(annotation.labelParts).toBeUndefined();
  });

  it('keeps the original label for unnumbered geometries and geometry-only records', () => {
    const annotation: ViewerAnnotation = {
      id: 'g-1',
      label: '(no data)',
      type: 'point',
      geometry: [0, 0, 0],
    };
    const selection = createEmptyActiveSelection();

    expect(withWorkbenchDisplayNumbers([annotation], selection, new Map(), new Map())[0].label)
      .toBe('(no data)');
    const numbered = withWorkbenchDisplayNumbers([annotation], selection, new Map([['g-1', 4]]), new Map())[0];
    expect(numbered.label).toBe('(no data)');
    expect(numbered.labelParts).toEqual([
      { type: 'badge', text: 'G4' },
      { type: 'text', text: ' (no data)' },
    ]);
  });
});
