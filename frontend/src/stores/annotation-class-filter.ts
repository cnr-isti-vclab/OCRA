/** Sentinel CURIE for annotation data rows without a vocabulary class. */
export const UNCLASSIFIED_ANNOTATION_CLASS = '__ocra:unclassified__';

export function isUnclassifiedClassFilter(curie: string): boolean {
  return curie === UNCLASSIFIED_ANNOTATION_CLASS;
}

export function dataMatchesClassFilter(
  datum: { class: string | null },
  allowedClasses: ReadonlySet<string>,
): boolean {
  if (datum.class === null) {
    return allowedClasses.has(UNCLASSIFIED_ANNOTATION_CLASS);
  }
  return allowedClasses.has(datum.class);
}

export function filterDataByClassFilter<T extends { class: string | null }>(
  data: readonly T[],
  filterValues: readonly string[],
): T[] {
  if (filterValues.length === 0) {
    return [...data];
  }

  const allowedClasses = new Set(filterValues);
  return data.filter((datum) => dataMatchesClassFilter(datum, allowedClasses));
}
