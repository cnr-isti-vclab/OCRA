/**
 * Stub for M1 — selection-time lock checks land in M2.
 * Always returns false (not blocked).
 */
export function isEntityBlockedForDeletion(_entityKind: 'geometry' | 'data' | 'link', _entityId: string): boolean {
  return false;
}
