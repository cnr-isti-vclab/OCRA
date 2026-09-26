/** Toggle one list item, replacing the selection unless additive selection is enabled. */
export function annotationListSelection(current: readonly string[], id: string, additive: boolean): string[] {
  if (!additive) return current.length === 1 && current[0] === id ? [] : [id];
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
}
