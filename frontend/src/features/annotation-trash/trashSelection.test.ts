import { describe, expect, it } from 'vitest';
import { updateTrashSelection } from './trashSelection';

describe('updateTrashSelection', () => {
  it('replaces the selection with an unselected item on a plain click', () => {
    expect([...updateTrashSelection(new Set(['a', 'b']), 'c', false)]).toEqual(['c']);
  });

  it('deselects a selected item on a plain click', () => {
    expect([...updateTrashSelection(new Set(['a', 'b']), 'a', false)]).toEqual(['b']);
  });

  it('adds and removes individual items with Ctrl/Cmd selection', () => {
    expect([...updateTrashSelection(new Set(['a']), 'b', true)]).toEqual(['a', 'b']);
    expect([...updateTrashSelection(new Set(['a', 'b']), 'b', true)]).toEqual(['a']);
  });
});
