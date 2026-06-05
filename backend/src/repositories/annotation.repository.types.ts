import type { ObjectId } from 'mongodb';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
} from 'shared/annotation-types';

export interface AnnotationMongoDocument {
  _id?: ObjectId;
}

export interface AnnotationGeometryDocument
  extends AnnotationGeometry,
    AnnotationMongoDocument {}

export interface AnnotationDataDocument
  extends AnnotationData,
    AnnotationMongoDocument {}

export interface AnnotationLinkDocument
  extends AnnotationLink,
    AnnotationMongoDocument {}

export type AnnotationRepositoryEntityKind = 'geometry' | 'data' | 'link';

export interface AnnotationOccConflict {
  ok: false;
  code: 'version_conflict';
  expectedVersion: number;
}

export interface AnnotationOccSuccess<TDocument> {
  ok: true;
  code: 'updated';
  document: TDocument;
  expectedVersion: number;
  nextVersion: number;
}

export type AnnotationOccResult<TDocument> =
  | AnnotationOccConflict
  | AnnotationOccSuccess<TDocument>;