import type {
  Collection,
  CreateIndexesOptions,
  Document,
  IndexDirection,
  IndexSpecification,
} from 'mongodb';
import { getContentDb } from '../lib/mongo/client.js';
import type { AnnotationOccResult } from './annotation.repository.types.js';

export const ANNOTATION_GEOMETRY_COLLECTION_NAME = 'annotation_geometry';
export const ANNOTATION_DATA_COLLECTION_NAME = 'annotation_data';
export const ANNOTATION_LINK_COLLECTION_NAME = 'annotation_link';

const ensuredAnnotationIndexCollections = new Set<string>();

export interface AnnotationRepositoryIndexDefinition {
  key: IndexSpecification;
  options?: CreateIndexesOptions;
}

export async function getAnnotationCollection<TDocument extends Document>(
  collectionName: string,
) {
  const db = await getContentDb();
  return db.collection<TDocument>(collectionName);
}

export async function ensureAnnotationIndexes<TDocument extends Document>(
  collectionName: string,
  collection: Collection<TDocument>,
  indexes: readonly AnnotationRepositoryIndexDefinition[],
) {
  if (ensuredAnnotationIndexCollections.has(collectionName)) {
    return;
  }

  for (const index of indexes) {
    await collection.createIndex(index.key, index.options);
  }

  ensuredAnnotationIndexCollections.add(collectionName);
}

export function createProjectScopedIdIndex() {
  return {
    key: { projectId: 1 as IndexDirection, id: 1 as IndexDirection },
    options: { unique: true },
  } satisfies AnnotationRepositoryIndexDefinition;
}

export function createOccConflictResult<TDocument>(
  expectedVersion: number,
): AnnotationOccResult<TDocument> {
  return {
    ok: false,
    code: 'version_conflict',
    expectedVersion,
  };
}

export function createOccSuccessResult<TDocument extends { version?: number }>(
  expectedVersion: number,
  document: TDocument,
): AnnotationOccResult<TDocument> {
  if (typeof document.version !== 'number') {
    throw new Error('OCC update result is missing a numeric version');
  }

  return {
    ok: true,
    code: 'updated',
    document,
    expectedVersion,
    nextVersion: document.version,
  };
}