import { randomUUID } from 'node:crypto';
import type { AnnotationRepositoryEntityKind } from './annotation.repository.types.js';

const ANNOTATION_ID_PREFIX_BY_KIND: Record<AnnotationRepositoryEntityKind, string> = {
  geometry: 'ag',
  data: 'ad',
  link: 'al',
};

export function createAnnotationEntityId(kind: AnnotationRepositoryEntityKind) {
  return `${ANNOTATION_ID_PREFIX_BY_KIND[kind]}_${randomUUID()}`;
}