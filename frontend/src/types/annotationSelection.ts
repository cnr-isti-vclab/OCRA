/** Annotation endpoint explicitly selected by the user, excluding derived highlights. */
export type PrimaryAnnotationSelection =
  | { kind: 'geometry'; id: string }
  | { kind: 'data'; id: string };
