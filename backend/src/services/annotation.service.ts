import { getPrismaClient } from '../../db.js';
import { getMongoClient } from '../lib/mongo/client.js';
import {
  findAnnotationDataById,
  getAnnotationDataCollection,
  insertAnnotationData,
  conditionalUpdateAnnotationData,
} from '../repositories/annotation-data.repository.js';
import {
  findAnnotationGeometryById,
  getAnnotationGeometryCollection,
  insertAnnotationGeometry,
  conditionalUpdateAnnotationGeometry,
} from '../repositories/annotation-geometry.repository.js';
import {
  findAnnotationLinkById,
  findAnnotationLinkByPair,
  getAnnotationLinkCollection,
  insertAnnotationLink,
  conditionalUpdateAnnotationLink,
} from '../repositories/annotation-link.repository.js';
import { createAnnotationEntityId } from '../repositories/annotation.repository.ids.js';
import type {
  AnnotationDataDocument,
  AnnotationGeometryDocument,
  AnnotationLinkDocument,
} from '../repositories/annotation.repository.types.js';
import { getHDTDocument } from './hdt-metadata.service.js';
import {
  annotationDataSchema,
  annotationGeometrySchema,
  annotationLinkSchema,
} from 'shared/annotation-schema';
import type {
  AnnotationData,
  AnnotationScopeType,
  AnnotationShape,
} from 'shared/annotation-types';
import type { HDTDocument } from '../types/index.js';

class AnnotationServiceAbort extends Error {}

export interface UpdateAnnotationDataInput {
  label?: string;
  description?: string;
  class?: string | null;
  content?: Record<string, unknown>;
}

export interface RestoreAnnotationLinkResult {
  linkVersion: number;
  geometryVersion: number;
  dataVersion: number;
}

function getTimestamp() {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

async function projectExists(projectId: string) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  return !!project;
}

function hasScene(hdtDocument: HDTDocument, sceneId: string) {
  return hdtDocument.scenes.some((scene) => scene.id === sceneId);
}

function hasAsset(hdtDocument: HDTDocument, assetId: string) {
  return hdtDocument.digitalAssets.some((asset) => asset.id === assetId);
}

function sceneContainsAsset(hdtDocument: HDTDocument, sceneId: string, assetId: string) {
  const scene = hdtDocument.scenes.find((entry) => entry.id === sceneId);
  return !!scene?.assets.some((asset) => asset.assetId === assetId);
}

function referenceExists(hdtDocument: HDTDocument, scopeType: AnnotationScopeType, scopeId: string) {
  return scopeType === 'scene'
    ? hasScene(hdtDocument, scopeId)
    : hasAsset(hdtDocument, scopeId);
}

function areLinkScopesCompatible(
  hdtDocument: HDTDocument,
  geometry: AnnotationGeometryDocument,
  data: AnnotationDataDocument,
) {
  if (geometry.referenceType === 'scene' && data.visibilityType === 'scene') {
    return geometry.referenceId === data.visibilityId;
  }

  if (geometry.referenceType === 'scene' && data.visibilityType === 'asset') {
    return sceneContainsAsset(hdtDocument, geometry.referenceId, data.visibilityId);
  }

  if (geometry.referenceType === 'asset' && data.visibilityType === 'scene') {
    return sceneContainsAsset(hdtDocument, data.visibilityId, geometry.referenceId);
  }

  return geometry.referenceId === data.visibilityId;
}

function validateSchema<T>(
  result: { success: true; data: T } | { success: false },
): result is { success: true; data: T } {
  return result.success;
}

function nextVersionCandidate<T extends { version: number }>(document: T) {
  return document.version + 1;
}

function buildAuditFields(userId: string, timestamp: string) {
  return {
    createdAt: timestamp,
    createdBy: userId,
    updatedAt: timestamp,
    updatedBy: userId,
  };
}

function buildUpdateAuditFields(userId: string, timestamp: string) {
  return {
    updatedAt: timestamp,
    updatedBy: userId,
  };
}

async function getValidatedProjectHdt(projectId: string) {
  if (!isNonEmptyString(projectId)) {
    return null;
  }

  if (!(await projectExists(projectId))) {
    return null;
  }

  return getHDTDocument(projectId);
}

export async function createAnnotationGeometry(
  projectId: string,
  shapes: AnnotationShape[],
  referenceType: AnnotationScopeType,
  referenceId: string,
  userId: string,
): Promise<string | null> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(referenceId)) {
    return null;
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !referenceExists(hdtDocument, referenceType, referenceId)) {
    return null;
  }

  const timestamp = getTimestamp();
  const document: AnnotationGeometryDocument = {
    id: createAnnotationEntityId('geometry'),
    projectId,
    shapes,
    referenceType,
    referenceId,
    version: 0,
    erasableAt: null,
    erasableBy: null,
    ...buildAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationGeometrySchema.safeParse(document))) {
    return null;
  }

  try {
    await insertAnnotationGeometry(document);
    return document.id;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }

    throw error;
  }
}

export async function updateAnnotationGeometryShapes(
  projectId: string,
  geometryId: string,
  expectedVersion: number,
  newShapes: AnnotationShape[],
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return false;
  }

  const existing = await findAnnotationGeometryById(geometryId);
  if (!existing || existing.projectId !== projectId) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    shapes: newShapes,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationGeometry(geometryId, expectedVersion, {
    $set: {
      shapes: newShapes,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  if (!result.ok || !validateSchema(annotationGeometrySchema.safeParse(result.document))) {
    return false;
  }

  return result.nextVersion;
}

export async function markAnnotationGeometryErasable(
  projectId: string,
  geometryId: string,
  expectedVersion: number,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return false;
  }

  const existing = await findAnnotationGeometryById(geometryId);
  if (!existing || existing.projectId !== projectId || existing.erasableAt !== null) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    erasableAt: timestamp,
    erasableBy: userId,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationGeometry(geometryId, expectedVersion, {
    $set: {
      erasableAt: timestamp,
      erasableBy: userId,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  return result.ok ? result.nextVersion : false;
}

export async function markAnnotationGeometryNonErasable(
  projectId: string,
  geometryId: string,
  expectedVersion: number,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return false;
  }

  const existing = await findAnnotationGeometryById(geometryId);
  if (!existing || existing.projectId !== projectId || existing.erasableAt === null) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    erasableAt: null,
    erasableBy: null,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationGeometry(geometryId, expectedVersion, {
    $set: {
      erasableAt: null,
      erasableBy: null,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  return result.ok ? result.nextVersion : false;
}

export async function createAnnotationData(
  projectId: string,
  label: string,
  description: string,
  annotationClass: string | null,
  content: Record<string, unknown>,
  visibilityType: AnnotationScopeType,
  visibilityId: string,
  userId: string,
): Promise<string | null> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(visibilityId)) {
    return null;
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !referenceExists(hdtDocument, visibilityType, visibilityId)) {
    return null;
  }

  const timestamp = getTimestamp();
  const document: AnnotationDataDocument = {
    id: createAnnotationEntityId('data'),
    projectId,
    label,
    description,
    class: annotationClass,
    content,
    visibilityType,
    visibilityId,
    version: 0,
    erasableAt: null,
    erasableBy: null,
    ...buildAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationDataSchema.safeParse(document))) {
    return null;
  }

  try {
    await insertAnnotationData(document);
    return document.id;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }

    throw error;
  }
}

export async function updateAnnotationData(
  projectId: string,
  dataId: string,
  expectedVersion: number,
  updates: UpdateAnnotationDataInput,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return false;
  }

  const existing = await findAnnotationDataById(dataId);
  if (!existing || existing.projectId !== projectId) {
    return false;
  }

  const mutableFields = Object.fromEntries(
    Object.entries({
      label: updates.label,
      description: updates.description,
      class: updates.class,
      content: updates.content,
    }).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(mutableFields).length === 0) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate: AnnotationData = {
    ...existing,
    ...mutableFields,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationData(dataId, expectedVersion, {
    $set: {
      ...mutableFields,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  if (!result.ok || !validateSchema(annotationDataSchema.safeParse(result.document))) {
    return false;
  }

  return result.nextVersion;
}

export async function markAnnotationDataErasable(
  projectId: string,
  dataId: string,
  expectedVersion: number,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return false;
  }

  const existing = await findAnnotationDataById(dataId);
  if (!existing || existing.projectId !== projectId || existing.erasableAt !== null) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    erasableAt: timestamp,
    erasableBy: userId,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationData(dataId, expectedVersion, {
    $set: {
      erasableAt: timestamp,
      erasableBy: userId,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  return result.ok ? result.nextVersion : false;
}

export async function markAnnotationDataNonErasable(
  projectId: string,
  dataId: string,
  expectedVersion: number,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return false;
  }

  const existing = await findAnnotationDataById(dataId);
  if (!existing || existing.projectId !== projectId || existing.erasableAt === null) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    erasableAt: null,
    erasableBy: null,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationData(dataId, expectedVersion, {
    $set: {
      erasableAt: null,
      erasableBy: null,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  return result.ok ? result.nextVersion : false;
}

export async function createAnnotationLink(
  projectId: string,
  geometryId: string,
  dataId: string,
  userId: string,
): Promise<string | null> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId) || !isNonEmptyString(dataId)) {
    return null;
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument) {
    return null;
  }

  const [geometry, data, existingLink] = await Promise.all([
    findAnnotationGeometryById(geometryId),
    findAnnotationDataById(dataId),
    findAnnotationLinkByPair(projectId, geometryId, dataId),
  ]);

  if (
    existingLink ||
    !geometry ||
    !data ||
    geometry.projectId !== projectId ||
    data.projectId !== projectId ||
    !areLinkScopesCompatible(hdtDocument, geometry, data)
  ) {
    return null;
  }

  const timestamp = getTimestamp();
  const document: AnnotationLinkDocument = {
    id: createAnnotationEntityId('link'),
    projectId,
    geometryId,
    dataId,
    version: 0,
    erasableAt: null,
    erasableBy: null,
    ...buildAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationLinkSchema.safeParse(document))) {
    return null;
  }

  try {
    await insertAnnotationLink(document);
    return document.id;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return null;
    }

    throw error;
  }
}

export async function markAnnotationLinkErasable(
  projectId: string,
  linkId: string,
  expectedVersion: number,
  userId: string,
): Promise<number | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(linkId)) {
    return false;
  }

  const existing = await findAnnotationLinkById(linkId);
  if (!existing || existing.projectId !== projectId || existing.erasableAt !== null) {
    return false;
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    erasableAt: timestamp,
    erasableBy: userId,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationLinkSchema.safeParse(candidate))) {
    return false;
  }

  const result = await conditionalUpdateAnnotationLink(linkId, expectedVersion, {
    $set: {
      erasableAt: timestamp,
      erasableBy: userId,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  return result.ok ? result.nextVersion : false;
}

export async function markAnnotationLinkNonErasable(
  projectId: string,
  linkId: string,
  expectedVersion: number,
  userId: string,
): Promise<RestoreAnnotationLinkResult | false> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(linkId)) {
    return false;
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let restoreResult: RestoreAnnotationLinkResult | false = false;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const [linkCollection, geometryCollection, dataCollection] = await Promise.all([
        getAnnotationLinkCollection(),
        getAnnotationGeometryCollection(),
        getAnnotationDataCollection(),
      ]);

      const link = await linkCollection.findOne({ projectId, id: linkId }, { session });
      if (!link || link.erasableAt === null) {
        throw new AnnotationServiceAbort();
      }

      const [geometry, data] = await Promise.all([
        geometryCollection.findOne({ projectId, id: link.geometryId }, { session }),
        dataCollection.findOne({ projectId, id: link.dataId }, { session }),
      ]);

      if (!geometry || !data) {
        throw new AnnotationServiceAbort();
      }

      const updatedLinkResult = await linkCollection.findOneAndUpdate(
        { projectId, id: linkId, version: expectedVersion },
        {
          $set: {
            erasableAt: null,
            erasableBy: null,
            ...buildUpdateAuditFields(userId, timestamp),
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', session },
      );

      const updatedLink = updatedLinkResult.value;
      if (!updatedLink || !validateSchema(annotationLinkSchema.safeParse(updatedLink))) {
        throw new AnnotationServiceAbort();
      }

      let geometryVersion = geometry.version;
      if (geometry.erasableAt !== null) {
        const updatedGeometryResult = await geometryCollection.findOneAndUpdate(
          { projectId, id: geometry.id, version: geometry.version },
          {
            $set: {
              erasableAt: null,
              erasableBy: null,
              ...buildUpdateAuditFields(userId, timestamp),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        );

        const updatedGeometry = updatedGeometryResult.value;
        if (!updatedGeometry || !validateSchema(annotationGeometrySchema.safeParse(updatedGeometry))) {
          throw new AnnotationServiceAbort();
        }

        geometryVersion = updatedGeometry.version;
      }

      let dataVersion = data.version;
      if (data.erasableAt !== null) {
        const updatedDataResult = await dataCollection.findOneAndUpdate(
          { projectId, id: data.id, version: data.version },
          {
            $set: {
              erasableAt: null,
              erasableBy: null,
              ...buildUpdateAuditFields(userId, timestamp),
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        );

        const updatedData = updatedDataResult.value;
        if (!updatedData || !validateSchema(annotationDataSchema.safeParse(updatedData))) {
          throw new AnnotationServiceAbort();
        }

        dataVersion = updatedData.version;
      }

      restoreResult = {
        linkVersion: updatedLink.version,
        geometryVersion,
        dataVersion,
      };
    });

    return restoreResult;
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return false;
    }

    throw error;
  } finally {
    await session.endSession();
  }
}