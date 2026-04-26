import type { Collection, UpdateFilter } from 'mongodb';
import {
  ANNOTATION_LINK_COLLECTION_NAME,
  createOccConflictResult,
  createOccSuccessResult,
  createProjectScopedIdIndex,
  ensureAnnotationIndexes,
  getAnnotationCollection,
} from './annotation.repository.common.js';
import type {
  AnnotationLinkDocument,
  AnnotationOccResult,
} from './annotation.repository.types.js';

const ANNOTATION_LINK_INDEXES = [
  createProjectScopedIdIndex(),
  {
    key: { projectId: 1, geometryId: 1, dataId: 1 },
    options: { unique: true },
  },
  {
    key: { projectId: 1, geometryId: 1 },
  },
  {
    key: { projectId: 1, dataId: 1 },
  },
  {
    key: { projectId: 1, erasableAt: 1 },
  },
] as const;

const LEGACY_ANNOTATION_LINK_INDEX_NAMES = [
  'projectId_1_annotationGeometry_1_annotationData_1',
  'projectId_1_annotationGeometry_1',
  'projectId_1_annotationData_1',
] as const;

async function dropLegacyAnnotationLinkIndexes(collection: Collection<AnnotationLinkDocument>) {
  let indexes;

  try {
    indexes = await collection.indexes();
  } catch (error: any) {
    const message = error?.message || '';
    if (error?.code === 26 || String(message).includes('ns does not exist')) {
      return;
    }
    throw error;
  }

  const existingIndexNames = new Set(indexes.map((index) => index.name));

  for (const indexName of LEGACY_ANNOTATION_LINK_INDEX_NAMES) {
    if (existingIndexNames.has(indexName)) {
      await collection.dropIndex(indexName);
    }
  }
}

export async function getAnnotationLinkCollection(): Promise<Collection<AnnotationLinkDocument>> {
  const collection = await getAnnotationCollection<AnnotationLinkDocument>(
    ANNOTATION_LINK_COLLECTION_NAME,
  );
  await dropLegacyAnnotationLinkIndexes(collection);
  await ensureAnnotationIndexes(
    ANNOTATION_LINK_COLLECTION_NAME,
    collection,
    ANNOTATION_LINK_INDEXES,
  );
  return collection;
}

export async function findAnnotationLinkById(id: string) {
  const collection = await getAnnotationLinkCollection();
  return collection.findOne({ id });
}

export async function findAnnotationLinksByProjectId(projectId: string) {
  const collection = await getAnnotationLinkCollection();
  return collection.find({ projectId }).toArray();
}

export async function findAnnotationLinksByGeometryId(projectId: string, geometryId: string) {
  const collection = await getAnnotationLinkCollection();
  return collection.find({ projectId, geometryId }).toArray();
}

export async function findAnnotationLinksByDataId(projectId: string, dataId: string) {
  const collection = await getAnnotationLinkCollection();
  return collection.find({ projectId, dataId }).toArray();
}

export async function findAnnotationLinksByGeometryIds(projectId: string, geometryIds: string[]) {
  const collection = await getAnnotationLinkCollection();
  return collection.find({ projectId, geometryId: { $in: geometryIds } }).toArray();
}

export async function findAnnotationLinksByDataIds(projectId: string, dataIds: string[]) {
  const collection = await getAnnotationLinkCollection();
  return collection.find({ projectId, dataId: { $in: dataIds } }).toArray();
}

export async function findAnnotationLinkByPair(projectId: string, geometryId: string, dataId: string) {
  const collection = await getAnnotationLinkCollection();
  return collection.findOne({ projectId, geometryId, dataId });
}

export async function insertAnnotationLink(doc: AnnotationLinkDocument) {
  const collection = await getAnnotationLinkCollection();
  await collection.insertOne(doc);
  return doc.id;
}

export async function conditionalUpdateAnnotationLink(
  id: string,
  expectedVersion: number,
  update: UpdateFilter<AnnotationLinkDocument>,
): Promise<AnnotationOccResult<AnnotationLinkDocument>> {
  const collection = await getAnnotationLinkCollection();
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

export async function deleteAnnotationLinkById(projectId: string, id: string) {
  const collection = await getAnnotationLinkCollection();
  const result = await collection.deleteOne({ projectId, id });
  return result.deletedCount > 0;
}

export async function deleteAnnotationLinksByProjectId(projectId: string) {
  const collection = await getAnnotationLinkCollection();
  const result = await collection.deleteMany({ projectId });
  return result.deletedCount;
}

export async function deleteAnnotationLinksByGeometryIds(projectId: string, geometryIds: string[]) {
  if (geometryIds.length === 0) {
    return 0;
  }

  const collection = await getAnnotationLinkCollection();
  const result = await collection.deleteMany({ projectId, geometryId: { $in: geometryIds } });
  return result.deletedCount;
}

export async function deleteAnnotationLinksByDataIds(projectId: string, dataIds: string[]) {
  if (dataIds.length === 0) {
    return 0;
  }

  const collection = await getAnnotationLinkCollection();
  const result = await collection.deleteMany({ projectId, dataId: { $in: dataIds } });
  return result.deletedCount;
}

export async function deleteErasableAnnotationLinksByProjectId(projectId: string) {
  const collection = await getAnnotationLinkCollection();
  const result = await collection.deleteMany({ projectId, erasableAt: { $ne: null } });
  return result.deletedCount;
}