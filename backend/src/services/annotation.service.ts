import { getPrismaClient } from '../../db.js';
import { getMongoClient } from '../lib/mongo/client.js';
import {
  findAnnotationDataById,
  findAnnotationDataByVisibility,
  findAnnotationDataByVisibilityIds,
  getAnnotationDataCollection,
  insertAnnotationData,
  conditionalUpdateAnnotationData,
} from '../repositories/annotation-data.repository.js';
import {
  findAnnotationGeometryById,
  findAnnotationGeometriesByReference,
  findAnnotationGeometriesByReferenceIds,
  getAnnotationGeometryCollection,
  insertAnnotationGeometry,
  conditionalUpdateAnnotationGeometry,
} from '../repositories/annotation-geometry.repository.js';
import {
  findAnnotationLinkById,
  findAnnotationLinkByPair,
  findAnnotationLinksByDataId,
  findAnnotationLinksByDataIds,
  findAnnotationLinksByGeometryId,
  findAnnotationLinksByGeometryIds,
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
  AnnotationGeometry,
  AnnotationLink,
  ResolvedAnnotation,
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

export interface SceneAnnotationsResult {
  geometries: AnnotationGeometry[];
  data: AnnotationData[];
  links: AnnotationLink[];
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

function dedupeById<T extends { id: string }>(documents: T[]) {
  return Array.from(new Map(documents.map((document) => [document.id, document])).values());
}

function isLinkVisible(link: AnnotationLinkDocument, includeErasable: boolean) {
  return includeErasable || link.erasableAt === null;
}

function isEntityVisible<T extends { erasableAt: string | null }>(
  document: T,
  includeErasable: boolean,
  hasIncomingNonErasableLink: boolean,
) {
  return includeErasable || document.erasableAt === null || hasIncomingNonErasableLink;
}

function getSceneAssetIds(hdtDocument: HDTDocument, sceneId: string) {
  const scene = hdtDocument.scenes.find((entry) => entry.id === sceneId);
  return scene ? scene.assets.map((asset) => asset.assetId) : null;
}

async function getIncomingVisibleLinksForGeometry(
  projectId: string,
  geometryId: string,
  includeErasable: boolean,
) {
  const links = await findAnnotationLinksByGeometryId(projectId, geometryId);
  return links.filter((link) => isLinkVisible(link, includeErasable));
}

async function getIncomingVisibleLinksForData(
  projectId: string,
  dataId: string,
  includeErasable: boolean,
) {
  const links = await findAnnotationLinksByDataId(projectId, dataId);
  return links.filter((link) => isLinkVisible(link, includeErasable));
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

export async function getAnnotationGeometry(
  projectId: string,
  geometryId: string,
  includeErasable = false,
): Promise<AnnotationGeometry | null> {
  if (!isNonEmptyString(geometryId)) {
    return null;
  }

  const geometry = await findAnnotationGeometryById(geometryId);
  if (!geometry || geometry.projectId !== projectId) {
    return null;
  }

  const visibleLinks = await getIncomingVisibleLinksForGeometry(projectId, geometryId, includeErasable);
  return isEntityVisible(geometry, includeErasable, visibleLinks.some((link) => link.erasableAt === null))
    ? geometry
    : null;
}

export async function getAnnotationData(
  projectId: string,
  dataId: string,
  includeErasable = false,
): Promise<AnnotationData | null> {
  if (!isNonEmptyString(dataId)) {
    return null;
  }

  const data = await findAnnotationDataById(dataId);
  if (!data || data.projectId !== projectId) {
    return null;
  }

  const visibleLinks = await getIncomingVisibleLinksForData(projectId, dataId, includeErasable);
  return isEntityVisible(data, includeErasable, visibleLinks.some((link) => link.erasableAt === null))
    ? data
    : null;
}

export async function getAnnotationLink(
  projectId: string,
  linkId: string,
  includeErasable = false,
): Promise<AnnotationLink | null> {
  if (!isNonEmptyString(linkId)) {
    return null;
  }

  const link = await findAnnotationLinkById(linkId);
  if (!link || link.projectId !== projectId || !isLinkVisible(link, includeErasable)) {
    return null;
  }

  return link;
}

export async function getAnnotationGeometriesForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<AnnotationGeometry[]> {
  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !hasScene(hdtDocument, sceneId)) {
    return [];
  }

  const sceneAssetIds = getSceneAssetIds(hdtDocument, sceneId) ?? [];
  const [sceneGeometries, assetGeometries] = await Promise.all([
    findAnnotationGeometriesByReference(projectId, 'scene', sceneId),
    sceneAssetIds.length > 0
      ? findAnnotationGeometriesByReferenceIds(projectId, 'asset', sceneAssetIds)
      : Promise.resolve([]),
  ]);

  const geometries = dedupeById([...sceneGeometries, ...assetGeometries]);
  const visibleLinks = await Promise.all(
    geometries.map(async (geometry) => ({
      geometry,
      links: await getIncomingVisibleLinksForGeometry(projectId, geometry.id, includeErasable),
    })),
  );

  return visibleLinks
    .filter(({ geometry, links }) =>
      isEntityVisible(geometry, includeErasable, links.some((link) => link.erasableAt === null)),
    )
    .map(({ geometry }) => geometry);
}

export async function getAnnotationDataForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<AnnotationData[]> {
  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !hasScene(hdtDocument, sceneId)) {
    return [];
  }

  const sceneAssetIds = getSceneAssetIds(hdtDocument, sceneId) ?? [];
  const [sceneData, assetData] = await Promise.all([
    findAnnotationDataByVisibility(projectId, 'scene', sceneId),
    sceneAssetIds.length > 0
      ? findAnnotationDataByVisibilityIds(projectId, 'asset', sceneAssetIds)
      : Promise.resolve([]),
  ]);

  const dataRecords = dedupeById([...sceneData, ...assetData]);
  const visibleLinks = await Promise.all(
    dataRecords.map(async (data) => ({
      data,
      links: await getIncomingVisibleLinksForData(projectId, data.id, includeErasable),
    })),
  );

  return visibleLinks
    .filter(({ data, links }) =>
      isEntityVisible(data, includeErasable, links.some((link) => link.erasableAt === null)),
    )
    .map(({ data }) => data);
}

export async function getResolvedAnnotationsForScene(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<ResolvedAnnotation[]> {
  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !hasScene(hdtDocument, sceneId)) {
    return [];
  }

  const sceneAssetIds = getSceneAssetIds(hdtDocument, sceneId) ?? [];
  const [geometries, dataRecords] = await Promise.all([
    getAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable),
    getAnnotationDataForSceneAssets(projectId, sceneId, includeErasable),
  ]);

  const geometryIds = geometries.map((geometry) => geometry.id);
  const dataIds = dataRecords.map((data) => data.id);

  const [linksByGeometry, linksByData] = await Promise.all([
    geometryIds.length > 0
      ? findAnnotationLinksByGeometryIds(projectId, geometryIds)
      : Promise.resolve([]),
    dataIds.length > 0
      ? findAnnotationLinksByDataIds(projectId, dataIds)
      : Promise.resolve([]),
  ]);

  const visibleLinks = dedupeById([...linksByGeometry, ...linksByData]).filter((link) => {
    if (!isLinkVisible(link, includeErasable)) {
      return false;
    }

    const geometry = geometries.find((entry) => entry.id === link.geometryId);
    const data = dataRecords.find((entry) => entry.id === link.dataId);
    if (!geometry || !data) {
      return false;
    }

    const geometryVisibleInScene = geometry.referenceType === 'scene'
      ? geometry.referenceId === sceneId
      : sceneAssetIds.includes(geometry.referenceId);
    const dataVisibleInScene = data.visibilityType === 'scene'
      ? data.visibilityId === sceneId
      : sceneAssetIds.includes(data.visibilityId);

    return geometryVisibleInScene && dataVisibleInScene && areLinkScopesCompatible(hdtDocument, geometry, data);
  });

  const geometryMap = new Map(geometries.map((geometry) => [geometry.id, geometry]));
  const dataMap = new Map(dataRecords.map((data) => [data.id, data]));

  return visibleLinks.flatMap((link) => {
    const geometry = geometryMap.get(link.geometryId);
    const data = dataMap.get(link.dataId);

    if (!geometry || !data) {
      return [];
    }

    return [{ geometry, data, link } satisfies ResolvedAnnotation];
  });
}

export async function getAnnotationLinksForProject(
  projectId: string,
  includeErasable = false,
  filters?: { geometryId?: string; dataId?: string },
): Promise<AnnotationLink[]> {
  if (!isNonEmptyString(projectId)) {
    return [];
  }

  if (isNonEmptyString(filters?.geometryId)) {
    const links = await findAnnotationLinksByGeometryId(projectId, filters.geometryId);
    return links.filter((link) => isLinkVisible(link, includeErasable));
  }

  if (isNonEmptyString(filters?.dataId)) {
    const links = await findAnnotationLinksByDataId(projectId, filters.dataId);
    return links.filter((link) => isLinkVisible(link, includeErasable));
  }

  const links = await getAnnotationLinkCollection().then((collection) => collection.find({ projectId }).toArray());
  return links.filter((link) => isLinkVisible(link, includeErasable));
}

export async function getAnnotationLinksForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<AnnotationLink[]> {
  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !hasScene(hdtDocument, sceneId)) {
    return [];
  }

  const sceneAssetIds = getSceneAssetIds(hdtDocument, sceneId) ?? [];
  const [geometries, dataRecords] = await Promise.all([
    getAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable),
    getAnnotationDataForSceneAssets(projectId, sceneId, includeErasable),
  ]);
  const geometryIds = geometries.map((geometry) => geometry.id);
  const dataIds = dataRecords.map((data) => data.id);

  const [linksByGeometry, linksByData] = await Promise.all([
    geometryIds.length > 0
      ? findAnnotationLinksByGeometryIds(projectId, geometryIds)
      : Promise.resolve([]),
    dataIds.length > 0
      ? findAnnotationLinksByDataIds(projectId, dataIds)
      : Promise.resolve([]),
  ]);

  return dedupeById([...linksByGeometry, ...linksByData]).filter((link) => {
    if (!isLinkVisible(link, includeErasable)) {
      return false;
    }

    const geometry = geometries.find((entry) => entry.id === link.geometryId);
    const data = dataRecords.find((entry) => entry.id === link.dataId);
    if (!geometry || !data) {
      return false;
    }

    const geometryVisibleInScene = geometry.referenceType === 'scene'
      ? geometry.referenceId === sceneId
      : sceneAssetIds.includes(geometry.referenceId);
    const dataVisibleInScene = data.visibilityType === 'scene'
      ? data.visibilityId === sceneId
      : sceneAssetIds.includes(data.visibilityId);

    return geometryVisibleInScene && dataVisibleInScene && areLinkScopesCompatible(hdtDocument, geometry, data);
  });
}

export async function getAnnotationsForScene(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<SceneAnnotationsResult> {
  const [geometries, data, links] = await Promise.all([
    getAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable),
    getAnnotationDataForSceneAssets(projectId, sceneId, includeErasable),
    getAnnotationLinksForSceneAssets(projectId, sceneId, includeErasable),
  ]);

  return { geometries, data, links };
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