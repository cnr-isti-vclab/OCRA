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
import type { AnnotationImpactMetadata } from 'shared/annotation-events';
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
  | 'version_conflict'
  | 'invalid_link_document';

export interface UpdateAnnotationDataInput {
  label?: string;
  description?: string;
  class?: string | null;
  content?: Record<string, unknown>;
}

export interface SceneAnnotationsResult {
  geometries: AnnotationGeometry[];
  data: AnnotationData[];
  links: AnnotationLink[];
}

export type AnnotationBundleLookupErrorCode = 'invalid_input' | 'scene_not_found';

function okResult<T>(value: T): AnnotationServiceSuccess<T> {
  return { ok: true, value };
}

function failResult<Code extends string>(code: Code): AnnotationServiceFailure<Code> {
  return { ok: false, code };
}

function getTimestamp() {
  return new Date().toISOString();
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

function nextVersionCandidate<T extends { version: number }>(document: T) {
  return document.version + 1;
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

  return project !== null;
}

async function getAnnotationCollections() {
  const [geometryCollection, dataCollection, linkCollection] = await Promise.all([
    getAnnotationGeometryCollection(),
    getAnnotationDataCollection(),
    getAnnotationLinkCollection(),
  ]);

  return { geometryCollection, dataCollection, linkCollection };
}

function validateSchema<T>(result: { success: boolean; data?: T }) {
  return result.success;
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

function hasScene(hdtDocument: HDTDocument, sceneId: string) {
  return hdtDocument.scenes.some((scene) => scene.id === sceneId);
}

function hasAsset(hdtDocument: HDTDocument, assetId: string) {
  return hdtDocument.digitalAssets.some((asset) => asset.id === assetId);
}

function referenceExists(hdtDocument: HDTDocument, scopeType: AnnotationScopeType, scopeId: string) {
  return scopeType === 'scene'
    ? hasScene(hdtDocument, scopeId)
    : hasAsset(hdtDocument, scopeId);
}

function sceneContainsAsset(hdtDocument: HDTDocument, sceneId: string, assetId: string) {
  const scene = hdtDocument.scenes.find((entry) => entry.id === sceneId);
  return scene ? scene.assets.some((asset) => asset.assetId === assetId) : false;
}

function listSceneIdsContainingAsset(hdtDocument: HDTDocument, assetId: string) {
  return hdtDocument.scenes
    .filter((scene) => scene.assets.some((asset) => asset.assetId === assetId))
    .map((scene) => scene.id);
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter((value) => isNonEmptyString(value))));
}

function resolveScopeImpact(
  hdtDocument: HDTDocument,
  scopeType: AnnotationScopeType,
  scopeId: string,
) {
  if (!referenceExists(hdtDocument, scopeType, scopeId)) {
    return null;
  }

  if (scopeType === 'scene') {
    return {
      affectedSceneIds: [scopeId],
      affectedAssetIds: [],
    };
  }

  return {
    affectedSceneIds: listSceneIdsContainingAsset(hdtDocument, scopeId),
    affectedAssetIds: [scopeId],
  };
}

function areLinkScopesCompatible(
  hdtDocument: HDTDocument,
  geometry: Pick<AnnotationGeometry, 'referenceType' | 'referenceId'>,
  data: Pick<AnnotationData, 'visibilityType' | 'visibilityId'>,
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

export async function resolveAnnotationImpactForScope(
  projectId: string,
  originScopeType: AnnotationScopeType,
  originScopeId: string,
): Promise<AnnotationImpactMetadata | null> {
  if (!isNonEmptyString(originScopeId)) {
    return null;
  }

  const hdtDocument = await getValidatedProjectHdt(projectId);
  if (!hdtDocument) {
    return null;
  }

  const scopeImpact = resolveScopeImpact(hdtDocument, originScopeType, originScopeId);
  if (!scopeImpact) {
    return null;
  }

  return {
    originScopeType,
    originScopeId,
    affectedSceneIds: uniqueIds(scopeImpact.affectedSceneIds),
    affectedAssetIds: uniqueIds(scopeImpact.affectedAssetIds),
  };
}

export async function resolveAnnotationImpactForLink(
  projectId: string,
  geometryId: string,
  dataId: string,
): Promise<AnnotationImpactMetadata | null> {
  if (!isNonEmptyString(geometryId) || !isNonEmptyString(dataId)) {
    return null;
  }

  const [hdtDocument, geometry, data] = await Promise.all([
    getValidatedProjectHdt(projectId),
    findAnnotationGeometryById(geometryId),
    findAnnotationDataById(dataId),
  ]);
  if (!hdtDocument || !geometry || !data || geometry.projectId !== projectId || data.projectId !== projectId) {
    return null;
  }

  const geometryImpact = resolveScopeImpact(hdtDocument, geometry.referenceType, geometry.referenceId);
  const dataImpact = resolveScopeImpact(hdtDocument, data.visibilityType, data.visibilityId);
  if (!geometryImpact || !dataImpact) {
    return null;
  }

  const sameOrigin = geometry.referenceType === data.visibilityType && geometry.referenceId === data.visibilityId;

  return {
    originScopeType: sameOrigin ? geometry.referenceType : 'mixed',
    originScopeId: sameOrigin ? geometry.referenceId : null,
    affectedSceneIds: uniqueIds([...geometryImpact.affectedSceneIds, ...dataImpact.affectedSceneIds]),
    affectedAssetIds: uniqueIds([...geometryImpact.affectedAssetIds, ...dataImpact.affectedAssetIds]),
  };
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

async function listAnnotationGeometriesForProject(
  projectId: string,
  includeErasable: boolean,
) {
  const geometries = await getAnnotationGeometryCollection().then((collection) => collection.find({ projectId }).toArray());
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

async function listAnnotationDataForProject(
  projectId: string,
  includeErasable: boolean,
) {
  const dataRecords = await getAnnotationDataCollection().then((collection) => collection.find({ projectId }).toArray());
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
): Promise<AnnotationServiceResult<AnnotationGeometry[], AnnotationBundleLookupErrorCode>> {
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
): Promise<AnnotationServiceResult<AnnotationData[], AnnotationBundleLookupErrorCode>> {
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
): Promise<AnnotationServiceResult<AnnotationLink[], AnnotationBundleLookupErrorCode>> {
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

export async function getAnnotationGeometries(
  projectId: string,
  sceneId?: string,
  includeErasable = false,
): Promise<AnnotationServiceResult<AnnotationGeometry[], AnnotationBundleLookupErrorCode>> {
  if (!isNonEmptyString(projectId)) {
    return failResult('invalid_input');
  }

  if (isNonEmptyString(sceneId)) {
    const sceneContext = await getProjectSceneContext(projectId, sceneId);
    if (!sceneContext.ok) {
      return sceneContext;
    }

    return okResult(
      await listAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable, sceneContext.value.sceneAssetIds),
    );
  }

  return okResult(await listAnnotationGeometriesForProject(projectId, includeErasable));
}

export async function getAnnotationDataList(
  projectId: string,
  sceneId?: string,
  includeErasable = false,
): Promise<AnnotationServiceResult<AnnotationData[], AnnotationBundleLookupErrorCode>> {
  if (!isNonEmptyString(projectId)) {
    return failResult('invalid_input');
  }

  if (isNonEmptyString(sceneId)) {
    const sceneContext = await getProjectSceneContext(projectId, sceneId);
    if (!sceneContext.ok) {
      return sceneContext;
    }

    return okResult(
      await listAnnotationDataForSceneAssets(projectId, sceneId, includeErasable, sceneContext.value.sceneAssetIds),
    );
  }

  return okResult(await listAnnotationDataForProject(projectId, includeErasable));
}

export async function getAnnotations(
  projectId: string,
  sceneId?: string,
  includeErasable = false,
): Promise<AnnotationServiceResult<SceneAnnotationsResult, AnnotationBundleLookupErrorCode>> {
  if (!isNonEmptyString(projectId)) {
    return failResult('invalid_input');
  }

  if (isNonEmptyString(sceneId)) {
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

  const [geometries, data, links] = await Promise.all([
    listAnnotationGeometriesForProject(projectId, includeErasable),
    listAnnotationDataForProject(projectId, includeErasable),
    getAnnotationLinksForProject(projectId, includeErasable),
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
      const { geometryCollection } = await getAnnotationCollections();
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
      const { geometryCollection } = await getAnnotationCollections();
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
      const { dataCollection } = await getAnnotationCollections();
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
      const { dataCollection } = await getAnnotationCollections();
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
): Promise<AnnotationServiceResult<number, MarkAnnotationLinkNonErasableErrorCode>> {
  if (!isNonEmptyString(userId) || !isNonEmptyString(linkId)) {
    return failResult('invalid_input');
  }

  const client = await getMongoClient();
  const session = client.startSession();

  try {
    let nextVersion: number | null = null;

    await session.withTransaction(async () => {
      const timestamp = getTimestamp();
      const linkCollection = await getAnnotationLinkCollection();

      const link = await linkCollection.findOne({ projectId, id: linkId }, { session });
      if (!link) {
        throw new AnnotationServiceAbort('link_not_found');
      }

      if (link.erasableAt === null) {
        throw new AnnotationServiceAbort('already_non_erasable');
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

      nextVersion = updatedLink.version;
    });

    if (nextVersion === null) {
      throw new Error('markAnnotationLinkNonErasable transaction completed without a version');
    }

    return okResult(nextVersion);
  } catch (error) {
    if (error instanceof AnnotationServiceAbort) {
      return failResult(error.code as MarkAnnotationLinkNonErasableErrorCode);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}