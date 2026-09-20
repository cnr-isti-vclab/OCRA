import { describe, expect, it } from 'vitest';
import { isGeometryEditingSession } from './isGeometryEditingSession';

describe('isGeometryEditingSession', () => {
  const base = {
    annotationMode: 'edit' as const,
    pencilActive: false,
    creationActive: false,
    deletionActive: false,
  };

  it('does not treat a canvas inspection selection as editing', () => {
    expect(isGeometryEditingSession(base)).toBe(false);
  });

  it('treats pencil selection outside workflows as editing', () => {
    expect(isGeometryEditingSession({ ...base, pencilActive: true })).toBe(true);
  });

  it('does not publish editor locks during creation, deletion, or read-only viewing', () => {
    expect(isGeometryEditingSession({ ...base, pencilActive: true, creationActive: true })).toBe(false);
    expect(isGeometryEditingSession({ ...base, pencilActive: true, deletionActive: true })).toBe(false);
    expect(isGeometryEditingSession({ ...base, pencilActive: true, annotationMode: 'viewer' })).toBe(false);
  });
});
