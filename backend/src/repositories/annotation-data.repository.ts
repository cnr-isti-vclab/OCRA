import type { Collection, UpdateFilter } from 'mongodb';
import type { AnnotationScopeType } from 'shared/annotation-types';
import {
  ANNOTATION_DATA_COLLECTION_NAME,
  createOccConflictResult,
  createOccSuccessResult,
  createProjectScopedIdIndex,
  ensureAnnotationIndexes,
  getAnnotationCollection,
} from './annotation.repository.common.js';
import type {
  AnnotationDataDocument,
  AnnotationOccResult,
} from './annotation.repository.types.js';

const ANNOTATION_DATA_INDEXES = [
  createProjectScopedIdIndex(),
  {
    key: { projectId: 1, visibilityType: 1, visibilityId: 1 },
  },
  {
    key: { projectId: 1, erasableAt: 1 },
  },
] as const;

export async function getAnnotationDataCollection(): Promise<Collection<AnnotationDataDocument>> {
  const collection = await getAnnotationCollection<AnnotationDataDocument>(
    ANNOTATION_DATA_COLLECTION_NAME,
  );
  await ensureAnnotationIndexes(
    ANNOTATION_DATA_COLLECTION_NAME,
    collection,
    ANNOTATION_DATA_INDEXES,
  );
  return collection;
}

export async function findAnnotationDataById(id: string) {
  const collection = await getAnnotationDataCollection();
  return collection.findOne({ id });
}

export async function findAnnotationDataByProjectId(projectId: string) {
  const collection = await getAnnotationDataCollection();
  return collection.find({ projectId }).toArray();
}

export async function findAnnotationDataByVisibility(
  projectId: string,
  visibilityType: AnnotationScopeType,
  visibilityId: string,
) {
  const collection = await getAnnotationDataCollection();
  return collection.find({ projectId, visibilityType, visibilityId }).toArray();
}

export async function deleteAnnotationDataByVisibility(
  projectId: string,
  visibilityType: AnnotationScopeType,
  visibilityId: string,
) {
  const collection = await getAnnotationDataCollection();
  const result = await collection.deleteMany({ projectId, visibilityType, visibilityId });
  return result.deletedCount;
}

export async function findAnnotationDataByVisibilityIds(
  projectId: string,
  visibilityType: AnnotationScopeType,
  visibilityIds: string[],
) {
  const collection = await getAnnotationDataCollection();
  return collection
    .find({ projectId, visibilityType, visibilityId: { $in: visibilityIds } })
    .toArray();
}

export async function insertAnnotationData(doc: AnnotationDataDocument) {
  const collection = await getAnnotationDataCollection();
  await collection.insertOne(doc);
  return doc.id;
}

export async function conditionalUpdateAnnotationData(
  id: string,
  expectedVersion: number,
  update: UpdateFilter<AnnotationDataDocument>,
): Promise<AnnotationOccResult<AnnotationDataDocument>> {
  const collection = await getAnnotationDataCollection();
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

export async function deleteAnnotationDataById(id: string, expectedVersion: number) {
  const collection = await getAnnotationDataCollection();
  const result = await collection.deleteOne({ id, version: expectedVersion });
  return result.deletedCount > 0;
}

export async function deleteAnnotationDataByProjectId(projectId: string) {
  const collection = await getAnnotationDataCollection();
  const result = await collection.deleteMany({ projectId });
  return result.deletedCount;
}