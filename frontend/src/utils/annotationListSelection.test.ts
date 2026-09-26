import { describe, expect, it } from 'vitest';
import { annotationListSelection } from './annotationListSelection';

describe('annotation list selection', () => {
  it('selects only the clicked item without a modifier', () => {
    expect(annotationListSelection(['a', 'b'], 'c', false)).toEqual(['c']);
    expect(annotationListSelection(['a', 'b'], 'a', false)).toEqual(['a']);
  });
  it('unselects the sole selected item on a normal click', () => {
    expect(annotationListSelection(['a'], 'a', false)).toEqual([]);
  });
  it('adds and removes individual items with additive selection', () => {
    expect(annotationListSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(annotationListSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });
  it('selects an item from an empty list with either mode', () => {
    expect(annotationListSelection([], 'a', false)).toEqual(['a']);
    expect(annotationListSelection([], 'a', true)).toEqual(['a']);
  });
});
