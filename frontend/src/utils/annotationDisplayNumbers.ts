interface NumberedAnnotationEntity {
  id: string;
  createdAt: string;
  erasableAt: string | null;
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Assigns presentation-only numbers in creation order, independent of UI filters.
 * The entity id breaks ties when records share a creation timestamp.
 */
export function buildAnnotationDisplayNumbers<T extends NumberedAnnotationEntity>(
  entities: readonly T[],
): ReadonlyMap<string, number> {
  const ordered = entities
    .filter((entity) => entity.erasableAt === null)
    .sort((left, right) =>
      compareCanonicalStrings(left.createdAt, right.createdAt)
      || compareCanonicalStrings(left.id, right.id));

  return new Map(ordered.map((entity, index) => [entity.id, index + 1]));
}

/** Orders a visible subset by its preassigned numbers without renumbering it. */
export function orderByAnnotationDisplayNumber<T extends { id: string }>(
  entities: readonly T[],
  numbers: ReadonlyMap<string, number>,
): T[] {
  return [...entities].sort((left, right) =>
    (numbers.get(left.id) ?? Number.MAX_SAFE_INTEGER)
    - (numbers.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}
