import type { AnnotationData } from 'shared/annotation-types';

/** Matches erased data by label, class CURIE, or resolved class label. */
export function filterErasableData(
  data: readonly AnnotationData[],
  query: string,
  classLabels: ReadonlyMap<string, string>,
): AnnotationData[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...data];
  return data.filter((datum) => {
    const classId = datum.class ?? '';
    const classLabel = classLabels.get(classId) ?? '';
    const snapshotLabel = datum.classDisplay?.preferredLabel ?? '';
    return [datum.label, classId, classLabel, snapshotLabel]
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
}
