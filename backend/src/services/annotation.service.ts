import { getPrismaClient } from '../../db.js';
import type { ClientSession } from 'mongodb';
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

class AnnotationServiceAbort<Code extends string = string> extends Error {
  constructor(public readonly code: Code) {
    super(code);
  }
}

interface AnnotationServiceSuccess<T> {
  ok: true;
  value: T;
}

interface AnnotationServiceFailure<Code extends string> {
  ok: false;
  code: Code;
}

type AnnotationServiceResult<T, Code extends string> = AnnotationServiceSuccess<T> | AnnotationServiceFailure<Code>;

export type CreateAnnotationGeometryErrorCode =
  | 'invalid_input'
  | 'reference_not_found'
  | 'invalid_geometry_document'
  | 'duplicate_geometry';

export type UpdateAnnotationGeometryErrorCode =
  | 'invalid_input'
  | 'geometry_not_found'
  | 'version_conflict'
  | 'invalid_geometry_document';

export type MarkAnnotationGeometryErasableErrorCode =
  | 'invalid_input'
  | 'geometry_not_found'
  | 'already_erasable'
  | 'version_conflict'
  | 'invalid_geometry_document';

export type MarkAnnotationGeometryNonErasableErrorCode =
  | 'invalid_input'
  | 'geometry_not_found'
  | 'already_non_erasable'
  | 'version_conflict'
  | 'invalid_geometry_document';

export type CreateAnnotationDataErrorCode =
  | 'invalid_input'
  | 'reference_not_found'
  | 'invalid_data_document'
  | 'duplicate_data';

export type UpdateAnnotationDataErrorCode =
  | 'invalid_input'
  | 'data_not_found'
  | 'no_mutable_fields'
  | 'version_conflict'
  | 'invalid_data_document';

export type MarkAnnotationDataErasableErrorCode =
  | 'invalid_input'
  | 'data_not_found'
  | 'already_erasable'
  | 'version_conflict'
  | 'invalid_data_document';

export type MarkAnnotationDataNonErasableErrorCode =
  | 'invalid_input'
  | 'data_not_found'
  | 'already_non_erasable'
  | 'version_conflict'
  | 'invalid_data_document';

export type CreateAnnotationLinkErrorCode =
  | 'invalid_input'
  | 'project_context_not_available'
  | 'geometry_not_found'
  | 'data_not_found'
  | 'duplicate_link_pair'
  | 'scope_incompatible'
  | 'invalid_link_document';

export type MarkAnnotationLinkErasableErrorCode =
  | 'invalid_input'
  | 'link_not_found'
  | 'already_erasable'
  | 'version_conflict'
  | 'invalid_link_document';

export type MarkAnnotationLinkNonErasableErrorCode =
  | 'invalid_input'
  | 'link_not_found'
  | 'already_non_erasable'
  | 'geometry_not_found'
  | 'data_not_found'
  | 'geometry_still_erasable'
  | 'data_still_erasable'
  | 'version_conflict'
  | 'invalid_link_document';

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

export type SceneAnnotationsLookupErrorCode = 'invalid_input' | 'scene_not_found';

function okResult<T>(value: T): AnnotationServiceSuccess<T> {
  return { ok: true, value };
}

function failResult<Code extends string>(code: Code): AnnotationServiceFailure<Code> {
  return { ok: false, code };
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

async function markLinkedAnnotationLinksErasable(
  linkCollection: Awaited<ReturnType<typeof getAnnotationLinkCollection>>,
  projectId: string,
  filters: { geometryId?: string; dataId?: string },
  userId: string,
  timestamp: string,
  session?: ClientSession,
) {
  await linkCollection.updateMany(
    {
      projectId,
      erasableAt: null,
      ...filters,
    },
    {
      $set: {
        erasableAt: timestamp,
        erasableBy: userId,
        ...buildUpdateAuditFields(userId, timestamp),
      },
      $inc: { version: 1 },
    },
    session ? { session } : undefined,
  );
}

async function markLinksNonErasableByIds(
  linkCollection: Awaited<ReturnType<typeof getAnnotationLinkCollection>>,
  projectId: string,
  linkIds: string[],
  userId: string,
  timestamp: string,
  session?: ClientSession,
) {
  if (linkIds.length === 0) {
    return;
  }

  await linkCollection.updateMany(
    {
      projectId,
      id: { $in: linkIds },
      erasableAt: { $ne: null },
    },
    {
      $set: {
        erasableAt: null,
        erasableBy: null,
        ...buildUpdateAuditFields(userId, timestamp),
      },
      $inc: { version: 1 },
    },
    session ? { session } : undefined,
  );
}

async function markLinkedAnnotationLinksNonErasableForGeometry(
  dataCollection: Awaited<ReturnType<typeof getAnnotationDataCollection>>,
  linkCollection: Awaited<ReturnType<typeof getAnnotationLinkCollection>>,
  projectId: string,
  geometryId: string,
  userId: string,
  timestamp: string,
  session?: ClientSession,
) {
  const links = await linkCollection.find({ projectId, geometryId }, session ? { session } : undefined).toArray();
  const erasableLinks = links.filter((link) => link.erasableAt !== null);
  if (erasableLinks.length === 0) {
    return;
  }

  const dataIds = Array.from(new Set(erasableLinks.map((link) => link.dataId)));
  const nonErasableData = await dataCollection
    .find({
      projectId,
      id: { $in: dataIds },
      erasableAt: null,
    }, session ? { session } : undefined)
    .toArray();
  const nonErasableDataIds = new Set(nonErasableData.map((data) => data.id));

  const eligibleLinkIds = erasableLinks
    .filter((link) => nonErasableDataIds.has(link.dataId))
    .map((link) => link.id);

  await markLinksNonErasableByIds(linkCollection, projectId, eligibleLinkIds, userId, timestamp, session);
}

async function markLinkedAnnotationLinksNonErasableForData(
  geometryCollection: Awaited<ReturnType<typeof getAnnotationGeometryCollection>>,
  linkCollection: Awaited<ReturnType<typeof getAnnotationLinkCollection>>,
  projectId: string,
  dataId: string,
  userId: string,
  timestamp: string,
  session?: ClientSession,
) {
  const links = await linkCollection.find({ projectId, dataId }, session ? { session } : undefined).toArray();
  const erasableLinks = links.filter((link) => link.erasableAt !== null);
  if (erasableLinks.length === 0) {
    return;
  }

  const geometryIds = Array.from(new Set(erasableLinks.map((link) => link.geometryId)));
  const nonErasableGeometries = await geometryCollection
    .find({
      projectId,
      id: { $in: geometryIds },
      erasableAt: null,
    }, session ? { session } : undefined)
    .toArray();
  const nonErasableGeometryIds = new Set(nonErasableGeometries.map((geometry) => geometry.id));

  const eligibleLinkIds = erasableLinks
    .filter((link) => nonErasableGeometryIds.has(link.geometryId))
    .map((link) => link.id);

  await markLinksNonErasableByIds(linkCollection, projectId, eligibleLinkIds, userId, timestamp, session);
}

async function getAnnotationCollections() {
  const [geometryCollection, dataCollection, linkCollection] = await Promise.all([
    getAnnotationGeometryCollection(),
    getAnnotationDataCollection(),
    getAnnotationLinkCollection(),
  ]);

  return { geometryCollection, dataCollection, linkCollection };
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

async function getProjectSceneContext(
  projectId: string,
  sceneId: string,
): Promise<AnnotationServiceResult<{ hdtDocument: HDTDocument; sceneAssetIds: string[] }, SceneAnnotationsLookupErrorCode>> {
  if (!isNonEmptyString(sceneId)) {
    return failResult('invalid_input');
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !hasScene(hdtDocument, sceneId)) {
    return failResult('scene_not_found');
  }

  return okResult({
    hdtDocument,
    sceneAssetIds: getSceneAssetIds(hdtDocument, sceneId) ?? [],
  });
}

async function listAnnotationGeometriesForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable: boolean,
  sceneAssetIds: string[],
) {
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

async function listAnnotationDataForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable: boolean,
  sceneAssetIds: string[],
) {
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

async function listAnnotationLinksForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable: boolean,
  hdtDocument: HDTDocument,
  sceneAssetIds: string[],
) {
  const [geometries, dataRecords] = await Promise.all([
    listAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
    listAnnotationDataForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
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
): Promise<AnnotationServiceResult<AnnotationGeometry[], SceneAnnotationsLookupErrorCode>> {
  const sceneContext = await getProjectSceneContext(projectId, sceneId);
  if (!sceneContext.ok) {
    return sceneContext;
  }

  return okResult(
    await listAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable, sceneContext.value.sceneAssetIds),
  );
}

export async function getAnnotationDataForSceneAssets(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<AnnotationServiceResult<AnnotationData[], SceneAnnotationsLookupErrorCode>> {
  const sceneContext = await getProjectSceneContext(projectId, sceneId);
  if (!sceneContext.ok) {
    return sceneContext;
  }

  return okResult(
    await listAnnotationDataForSceneAssets(projectId, sceneId, includeErasable, sceneContext.value.sceneAssetIds),
  );
}

export async function getResolvedAnnotationsForScene(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<ResolvedAnnotation[]> {
  const sceneContext = await getProjectSceneContext(projectId, sceneId);
  if (!sceneContext.ok) {
    return [];
  }

  const { hdtDocument, sceneAssetIds } = sceneContext.value;
  const [geometries, dataRecords] = await Promise.all([
    listAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
    listAnnotationDataForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
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
): Promise<AnnotationServiceResult<AnnotationLink[], SceneAnnotationsLookupErrorCode>> {
  const sceneContext = await getProjectSceneContext(projectId, sceneId);
  if (!sceneContext.ok) {
    return sceneContext;
  }

  return okResult(
    await listAnnotationLinksForSceneAssets(
      projectId,
      sceneId,
      includeErasable,
      sceneContext.value.hdtDocument,
      sceneContext.value.sceneAssetIds,
    ),
  );
}

export async function getAnnotationsForScene(
  projectId: string,
  sceneId: string,
  includeErasable = false,
): Promise<AnnotationServiceResult<SceneAnnotationsResult, SceneAnnotationsLookupErrorCode>> {
  const sceneContext = await getProjectSceneContext(projectId, sceneId);
  if (!sceneContext.ok) {
    return sceneContext;
  }

  const { hdtDocument, sceneAssetIds } = sceneContext.value;
  const [geometries, data, links] = await Promise.all([
    listAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
    listAnnotationDataForSceneAssets(projectId, sceneId, includeErasable, sceneAssetIds),
    listAnnotationLinksForSceneAssets(projectId, sceneId, includeErasable, hdtDocument, sceneAssetIds),
  ]);

  return okResult({ geometries, data, links });
}

export async function createAnnotationGeometry(
  projectId: string,
  shapes: AnnotationShape[],
  referenceType: AnnotationScopeType,
  referenceId: string,
  userId: string,
): Promise<AnnotationServiceResult<string, CreateAnnotationGeometryErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(referenceId)) {
    return failResult('invalid_input');
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !referenceExists(hdtDocument, referenceType, referenceId)) {
    return failResult('reference_not_found');
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
    return failResult('invalid_geometry_document');
  }

  try {
    await insertAnnotationGeometry(document);
    return okResult(document.id);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return failResult('duplicate_geometry');
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
): Promise<AnnotationServiceResult<number, UpdateAnnotationGeometryErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return failResult('invalid_input');
  }

  const existing = await findAnnotationGeometryById(geometryId);
  if (!existing || existing.projectId !== projectId) {
    return failResult('geometry_not_found');
  }

  const timestamp = getTimestamp();
  const candidate = {
    ...existing,
    shapes: newShapes,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
    return failResult('invalid_geometry_document');
  }

  const result = await conditionalUpdateAnnotationGeometry(geometryId, expectedVersion, {
    $set: {
      shapes: newShapes,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  if (!result.ok) {
    return failResult('version_conflict');
  }

  if (!validateSchema(annotationGeometrySchema.safeParse(result.document))) {
    return failResult('invalid_geometry_document');
  }

  return okResult(result.nextVersion);
}

export async function markAnnotationGeometryErasable(
  projectId: string,
  geometryId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<number, MarkAnnotationGeometryErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let nextVersion: number | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const { geometryCollection, linkCollection } = await getAnnotationCollections();
      const existing = await geometryCollection.findOne({ projectId, id: geometryId }, { session });
      if (!existing) {
        throw new AnnotationServiceAbort('geometry_not_found');
      }

      if (existing.erasableAt !== null) {
        throw new AnnotationServiceAbort('already_erasable');
      }

      const candidate = {
        ...existing,
        erasableAt: timestamp,
        erasableBy: userId,
        version: nextVersionCandidate(existing),
        ...buildUpdateAuditFields(userId, timestamp),
      };

      if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
        throw new AnnotationServiceAbort('invalid_geometry_document');
      }

      const updatedResult = await geometryCollection.findOneAndUpdate(
        { projectId, id: geometryId, version: expectedVersion },
        {
          $set: {
            erasableAt: timestamp,
            erasableBy: userId,
            ...buildUpdateAuditFields(userId, timestamp),
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', session },
      );
      const updated = updatedResult.value;
      if (!updated) {
        throw new AnnotationServiceAbort('version_conflict');
      }

      if (!validateSchema(annotationGeometrySchema.safeParse(updated))) {
        throw new AnnotationServiceAbort('invalid_geometry_document');
      }

      await markLinkedAnnotationLinksErasable(linkCollection, projectId, { geometryId }, userId, timestamp, session);
      nextVersion = updated.version;
    });

    if (nextVersion === null) {
      throw new Error('markAnnotationGeometryErasable transaction completed without a version');
    }

    return okResult(nextVersion);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationGeometryErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

export async function markAnnotationGeometryNonErasable(
  projectId: string,
  geometryId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<number, MarkAnnotationGeometryNonErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let nextVersion: number | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const { geometryCollection, dataCollection, linkCollection } = await getAnnotationCollections();
      const existing = await geometryCollection.findOne({ projectId, id: geometryId }, { session });
      if (!existing) {
        throw new AnnotationServiceAbort('geometry_not_found');
      }

      if (existing.erasableAt === null) {
        throw new AnnotationServiceAbort('already_non_erasable');
      }

      const candidate = {
        ...existing,
        erasableAt: null,
        erasableBy: null,
        version: nextVersionCandidate(existing),
        ...buildUpdateAuditFields(userId, timestamp),
      };

      if (!validateSchema(annotationGeometrySchema.safeParse(candidate))) {
        throw new AnnotationServiceAbort('invalid_geometry_document');
      }

      const updatedResult = await geometryCollection.findOneAndUpdate(
        { projectId, id: geometryId, version: expectedVersion },
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
      const updated = updatedResult.value;
      if (!updated) {
        throw new AnnotationServiceAbort('version_conflict');
      }

      if (!validateSchema(annotationGeometrySchema.safeParse(updated))) {
        throw new AnnotationServiceAbort('invalid_geometry_document');
      }

      await markLinkedAnnotationLinksNonErasableForGeometry(
        dataCollection,
        linkCollection,
        projectId,
        geometryId,
        userId,
        timestamp,
        session,
      );
      nextVersion = updated.version;
    });

    if (nextVersion === null) {
      throw new Error('markAnnotationGeometryNonErasable transaction completed without a version');
    }

    return okResult(nextVersion);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationGeometryNonErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
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
): Promise<AnnotationServiceResult<string, CreateAnnotationDataErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(visibilityId)) {
    return failResult('invalid_input');
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument || !referenceExists(hdtDocument, visibilityType, visibilityId)) {
    return failResult('reference_not_found');
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
    return failResult('invalid_data_document');
  }

  try {
    await insertAnnotationData(document);
    return okResult(document.id);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return failResult('duplicate_data');
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
): Promise<AnnotationServiceResult<number, UpdateAnnotationDataErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return failResult('invalid_input');
  }

  const existing = await findAnnotationDataById(dataId);
  if (!existing || existing.projectId !== projectId) {
    return failResult('data_not_found');
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
    return failResult('no_mutable_fields');
  }

  const timestamp = getTimestamp();
  const candidate: AnnotationData = {
    ...existing,
    ...mutableFields,
    version: nextVersionCandidate(existing),
    ...buildUpdateAuditFields(userId, timestamp),
  };

  if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
    return failResult('invalid_data_document');
  }

  const result = await conditionalUpdateAnnotationData(dataId, expectedVersion, {
    $set: {
      ...mutableFields,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  if (!result.ok) {
    return failResult('version_conflict');
  }

  if (!validateSchema(annotationDataSchema.safeParse(result.document))) {
    return failResult('invalid_data_document');
  }

  return okResult(result.nextVersion);
}

export async function markAnnotationDataErasable(
  projectId: string,
  dataId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<number, MarkAnnotationDataErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let nextVersion: number | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const { dataCollection, linkCollection } = await getAnnotationCollections();
      const existing = await dataCollection.findOne({ projectId, id: dataId }, { session });
      if (!existing) {
        throw new AnnotationServiceAbort('data_not_found');
      }

      if (existing.erasableAt !== null) {
        throw new AnnotationServiceAbort('already_erasable');
      }

      const candidate = {
        ...existing,
        erasableAt: timestamp,
        erasableBy: userId,
        version: nextVersionCandidate(existing),
        ...buildUpdateAuditFields(userId, timestamp),
      };

      if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
        throw new AnnotationServiceAbort('invalid_data_document');
      }

      const updatedResult = await dataCollection.findOneAndUpdate(
        { projectId, id: dataId, version: expectedVersion },
        {
          $set: {
            erasableAt: timestamp,
            erasableBy: userId,
            ...buildUpdateAuditFields(userId, timestamp),
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after', session },
      );
      const updated = updatedResult.value;
      if (!updated) {
        throw new AnnotationServiceAbort('version_conflict');
      }

      if (!validateSchema(annotationDataSchema.safeParse(updated))) {
        throw new AnnotationServiceAbort('invalid_data_document');
      }

      await markLinkedAnnotationLinksErasable(linkCollection, projectId, { dataId }, userId, timestamp, session);
      nextVersion = updated.version;
    });

    if (nextVersion === null) {
      throw new Error('markAnnotationDataErasable transaction completed without a version');
    }

    return okResult(nextVersion);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationDataErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

export async function markAnnotationDataNonErasable(
  projectId: string,
  dataId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<number, MarkAnnotationDataNonErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(dataId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let nextVersion: number | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const { geometryCollection, dataCollection, linkCollection } = await getAnnotationCollections();
      const existing = await dataCollection.findOne({ projectId, id: dataId }, { session });
      if (!existing) {
        throw new AnnotationServiceAbort('data_not_found');
      }

      if (existing.erasableAt === null) {
        throw new AnnotationServiceAbort('already_non_erasable');
      }

      const candidate = {
        ...existing,
        erasableAt: null,
        erasableBy: null,
        version: nextVersionCandidate(existing),
        ...buildUpdateAuditFields(userId, timestamp),
      };

      if (!validateSchema(annotationDataSchema.safeParse(candidate))) {
        throw new AnnotationServiceAbort('invalid_data_document');
      }

      const updatedResult = await dataCollection.findOneAndUpdate(
        { projectId, id: dataId, version: expectedVersion },
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
      const updated = updatedResult.value;
      if (!updated) {
        throw new AnnotationServiceAbort('version_conflict');
      }

      if (!validateSchema(annotationDataSchema.safeParse(updated))) {
        throw new AnnotationServiceAbort('invalid_data_document');
      }

      await markLinkedAnnotationLinksNonErasableForData(
        geometryCollection,
        linkCollection,
        projectId,
        dataId,
        userId,
        timestamp,
        session,
      );
      nextVersion = updated.version;
    });

    if (nextVersion === null) {
      throw new Error('markAnnotationDataNonErasable transaction completed without a version');
    }

    return okResult(nextVersion);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationDataNonErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

export async function createAnnotationLink(
  projectId: string,
  geometryId: string,
  dataId: string,
  userId: string,
): Promise<AnnotationServiceResult<string, CreateAnnotationLinkErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(geometryId) || !isNonEmptyString(dataId)) {
    return failResult('invalid_input');
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument) {
    return failResult('project_context_not_available');
  }

  const [geometry, data, existingLink] = await Promise.all([
    findAnnotationGeometryById(geometryId),
    findAnnotationDataById(dataId),
    findAnnotationLinkByPair(projectId, geometryId, dataId),
  ]);

  if (existingLink) {
    return failResult('duplicate_link_pair');
  }

  if (!geometry || geometry.projectId !== projectId) {
    return failResult('geometry_not_found');
  }

  if (!data || data.projectId !== projectId) {
    return failResult('data_not_found');
  }

  if (!areLinkScopesCompatible(hdtDocument, geometry, data)) {
    return failResult('scope_incompatible');
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
    return failResult('invalid_link_document');
  }

  try {
    await insertAnnotationLink(document);
    return okResult(document.id);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return failResult('duplicate_link_pair');
    }

    throw error;
  }
}

export async function markAnnotationLinkErasable(
  projectId: string,
  linkId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<number, MarkAnnotationLinkErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(linkId)) {
    return failResult('invalid_input');
  }

  const existing = await findAnnotationLinkById(linkId);
  if (!existing || existing.projectId !== projectId) {
    return failResult('link_not_found');
  }

  if (existing.erasableAt !== null) {
    return failResult('already_erasable');
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
    return failResult('invalid_link_document');
  }

  const result = await conditionalUpdateAnnotationLink(linkId, expectedVersion, {
    $set: {
      erasableAt: timestamp,
      erasableBy: userId,
      ...buildUpdateAuditFields(userId, timestamp),
    },
    $inc: { version: 1 },
  });

  if (!result.ok) {
    return failResult('version_conflict');
  }

  if (!validateSchema(annotationLinkSchema.safeParse(result.document))) {
    return failResult('invalid_link_document');
  }

  return okResult(result.nextVersion);
}

export async function markAnnotationLinkNonErasable(
  projectId: string,
  linkId: string,
  expectedVersion: number,
  userId: string,
): Promise<AnnotationServiceResult<RestoreAnnotationLinkResult, MarkAnnotationLinkNonErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(linkId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let restoreResult: RestoreAnnotationLinkResult | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const [linkCollection, geometryCollection, dataCollection] = await Promise.all([
        getAnnotationLinkCollection(),
        getAnnotationGeometryCollection(),
        getAnnotationDataCollection(),
      ]);

      const link = await linkCollection.findOne({ projectId, id: linkId }, { session });
      if (!link) {
        throw new AnnotationServiceAbort('link_not_found');
      }

      if (link.erasableAt === null) {
        throw new AnnotationServiceAbort('already_non_erasable');
      }

      const [geometry, data] = await Promise.all([
        geometryCollection.findOne({ projectId, id: link.geometryId }, { session }),
        dataCollection.findOne({ projectId, id: link.dataId }, { session }),
      ]);

      if (!geometry || !data) {
        throw new AnnotationServiceAbort(!geometry ? 'geometry_not_found' : 'data_not_found');
      }

      if (geometry.erasableAt !== null) {
        throw new AnnotationServiceAbort('geometry_still_erasable');
      }

      if (data.erasableAt !== null) {
        throw new AnnotationServiceAbort('data_still_erasable');
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
      if (!updatedLink) {
        throw new AnnotationServiceAbort('version_conflict');
      }

      if (!validateSchema(annotationLinkSchema.safeParse(updatedLink))) {
        throw new AnnotationServiceAbort('invalid_link_document');
      }

      restoreResult = {
        linkVersion: updatedLink.version,
        geometryVersion: geometry.version,
        dataVersion: data.version,
      };
    });

    if (restoreResult === null) {
      throw new Error('markAnnotationLinkNonErasable transaction completed without a restore result');
    }

    return okResult(restoreResult);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationLinkNonErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}