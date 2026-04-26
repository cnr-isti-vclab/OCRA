import type { Collection, UpdateFilter } from 'mongodb';
import type { AnnotationScopeType } from 'shared/annotation-types';
import {
  ANNOTATION_GEOMETRY_COLLECTION_NAME,
  createOccConflictResult,
  createOccSuccessResult,
  createProjectScopedIdIndex,
  ensureAnnotationIndexes,
  getAnnotationCollection,
} from './annotation.repository.common.js';
import type {
  AnnotationGeometryDocument,
  AnnotationOccResult,
} from './annotation.repository.types.js';

const ANNOTATION_GEOMETRY_INDEXES = [
  createProjectScopedIdIndex(),
  {
    key: { projectId: 1, referenceType: 1, referenceId: 1 },
  },
  {
    key: { projectId: 1, erasableAt: 1 },
  },
] as const;

export async function getAnnotationGeometryCollection(): Promise<Collection<AnnotationGeometryDocument>> {
  const collection = await getAnnotationCollection<AnnotationGeometryDocument>(
    ANNOTATION_GEOMETRY_COLLECTION_NAME,
  );
  await ensureAnnotationIndexes(
    ANNOTATION_GEOMETRY_COLLECTION_NAME,
    collection,
    ANNOTATION_GEOMETRY_INDEXES,
  );
  return collection;
}

export async function findAnnotationGeometryById(id: string) {
  const collection = await getAnnotationGeometryCollection();
  return collection.findOne({ id });
}

export async function findAnnotationGeometriesByProjectId(projectId: string) {
  const collection = await getAnnotationGeometryCollection();
  return collection.find({ projectId }).toArray();
}

export async function findAnnotationGeometriesByReference(
  projectId: string,
  referenceType: AnnotationScopeType,
  referenceId: string,
) {
  const collection = await getAnnotationGeometryCollection();
  return collection.find({ projectId, referenceType, referenceId }).toArray();
}

export async function findAnnotationGeometriesByReferenceIds(
  projectId: string,
  referenceType: AnnotationScopeType,
  referenceIds: string[],
) {
  const collection = await getAnnotationGeometryCollection();
  return collection
    .find({ projectId, referenceType, referenceId: { $in: referenceIds } })
    .toArray();
}

export async function insertAnnotationGeometry(doc: AnnotationGeometryDocument) {
  const collection = await getAnnotationGeometryCollection();
  await collection.insertOne(doc);
  return doc.id;
}

export async function conditionalUpdateAnnotationGeometry(
  id: string,
  expectedVersion: number,
  update: UpdateFilter<AnnotationGeometryDocument>,
): Promise<AnnotationOccResult<AnnotationGeometryDocument>> {
  const collection = await getAnnotationGeometryCollection();
  const result = await collection.findOneAndUpdate(
    { id, version: expectedVersion },
    update,
    { returnDocument: 'after' },
  );
  const document = result.value;

  if (!document) {
    return createOccConflictResult(expectedVersion);
  }

  return createOccSuccessResult(expectedVersion, document);
}

export async function deleteAnnotationGeometryById(id: string, expectedVersion: number) {
  const collection = await getAnnotationGeometryCollection();
  const result = await collection.deleteOne({ id, version: expectedVersion });
  return result.deletedCount > 0;
}

export async function deleteAnnotationGeometriesByProjectId(projectId: string) {
  const collection = await getAnnotationGeometryCollection();
  const result = await collection.deleteMany({ projectId });
  return result.deletedCount;
}