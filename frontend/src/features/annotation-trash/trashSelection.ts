/** Applies list selection semantics shared by Geometry and Data in the trash. */
export function updateTrashSelection(
  current: ReadonlySet<string>,
  id: string,
  additive: boolean,
): Set<string> {
  if (current.has(id)) {
    const remaining = new Set(current);
    remaining.delete(id);
    return remaining;
  }
  const next = additive ? new Set(current) : new Set<string>();
  next.add(id);
  return next;
}
