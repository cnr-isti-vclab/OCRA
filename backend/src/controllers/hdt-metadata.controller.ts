/**
 * HDT Metadata Controller
 *
 * Handles HTTP requests for managing Heritage Digital Twin (HDT) documents.
 * The HDT document lives in MongoDB and contains:
 * - metadata (Dublin Core + CIDOC CRM, etc.)
 * - a pool of digitalAssets (3d-model, rti, ...)
 * - scenes and scene-asset associations (scene composition)
 *
 * Storage layout (project_files):
 * - 3D assets are stored under:
 *     project_files/<projectId>/3d-model/<assetId>/<filename>
 *   and are served publicly as:
 *     /assets/projects/<projectId>/3d-model/<assetId>/<filename>
 *
 * - RTI assets are stored under:
 *     project_files/<projectId>/rti/<assetId>/(info.json + tiles/images/...)
 *   and are served publicly as:
 *     /assets/projects/<projectId>/rti/<assetId>/info.json
 *     (and other RTI files under the same folder)
 *
 * Scenes:
 * - scenes are persisted in MongoDB inside the HDT document.
 * - exporting scene JSON to disk is optional and used only for debugging
 *   (see exportSceneFileHandler).
 */

import { Request, Response } from 'express';
import { formatZodIssues, sceneAssetReferenceUpdateSchema } from 'shared/scene-schema';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import { sendApiError } from '../lib/api-error.js';
import {
  getHDTDocument,
  createHDTDocument,
  updateHDTMetadata,
  deleteHDTDocument,
  addDigitalAsset,
  updateDigitalAsset,
  removeDigitalAsset,
  addScene,
  updateScene,
  removeScene,
  addAssetToScene,
  updateAssetInScene,
  removeAssetFromScene,
  generateSceneFile,
  generateAllSceneFiles,
  getAvailableScenes
} from '../services/hdt-metadata.service.js';
import { requireOwnedExclusiveStructuringLock } from '../middleware/project-structuring-lock.js';
import { findAnnotationGeometriesByReference, deleteAnnotationGeometriesByReference } from '../repositories/annotation-geometry.repository.js';
import { findAnnotationDataByVisibility, deleteAnnotationDataByVisibility } from '../repositories/annotation-data.repository.js';
import { deleteAnnotationLinksByDataIds, deleteAnnotationLinksByGeometryIds } from '../repositories/annotation-link.repository.js';
import { getPrismaClient } from '../../db.js';
import { auditBestEffort } from '../utils/audit.js';
import {
  User,
  DigitalAssetCreateRequest,
  PhysicalObjectMetadata
} from '../types/index.js';
import { RoleEnum } from '@prisma/client';
import { projectImageAssetDir, projectModel3dAssetDir, projectRtiAssetDir } from '../utils/project-static-paths.js';
import {
  normalizePhysicalObjectMetadata,
  normalizePhysicalObjectSourceType,
  toPhysicalObjectMetadataPatch
} from '../services/physical-object-import/normalize.js';
import { getPhysicalObjectImportAdapter } from '../services/physical-object-import/index.js';

import fs from 'fs/promises';

/**
 * Get current user from request (populated by auth middleware).
 */
function getCurrentUser(req: Request): User | null {
  // TEST MODE: Check if user was set by test auth
  if (process.env.NODE_ENV === 'test' && req.user) {
    return req.user;
  }
  return req.user || null;
}

/**
 * Check whether the authenticated user has at least viewer access to a project.
 * - sys_admin users are always allowed
 * - otherwise user must have RoleEnum.viewer, RoleEnum.editor, or RoleEnum.manager for the project
 * Note: public projects do NOT bypass this check. Discoverability (public flag) only affects
 * listing/metadata endpoints, not HDT content access.
 */
async function checkIsViewerOrAboveOfProject(userSub: string, projectId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({ where: { sub: userSub } });
  if (!user) return false;

  if (user.sys_admin) return true;

  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: { in: [RoleEnum.viewer, RoleEnum.editor, RoleEnum.manager] }
    }
  });

  return !!role;
}

/**
 * Check whether the authenticated user is manager of a given project.
 * - sys_admin users are always allowed
 * - otherwise user must have RoleEnum.manager for the project
 */
async function checkIsManagerOfProject(userSub: string, projectId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  // Get user from database
  const user = await prisma.user.findUnique({ where: { sub: userSub } });
  if (!user) return false;

  // Check if sysadmin
  if (user.sys_admin) return true;

  // Check if manager
  const isManager = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: RoleEnum.manager
    }
  });

  return !!isManager;
}

// ============================================================================
// RTI Helpers
// ============================================================================

/**
 * Resolve the on-disk directory of an RTI asset starting from a public file entryPoint.
 *
 * Supported public URL format:
 *   /assets/projects/<projectId>/rti/<assetId>/info.json
 *
 * Absolute URLs are also supported, for example:
 *   http://host:port/assets/projects/<projectId>/rti/<assetId>/info.json
 *
 * Returns:
 *   project_files/<projectId>/rti/<assetId>
 *
 * Returns null if:
 * - URL is missing or invalid
 * - URL does not match /assets/projects/... pattern
 * - URL does not point to an RTI asset
 *
 * NOTE:
 * In the current storage model we already know <projectId> and <assetId> from
 * the HDT asset record, so in most cases you can compute the directory with:
 *   projectRtiAssetDir(projectId, assetId)
 * This helper is mainly for optional legacy/fallback support.
 */
function resolveRtiAssetDirectory(entryPointUrl?: string | null): string | null {
  if (!entryPointUrl) return null;

  let urlPath = entryPointUrl;

  // If absolute URL, extract only pathname
  try {
    if (entryPointUrl.startsWith('http://') || entryPointUrl.startsWith('https://')) {
      urlPath = new URL(entryPointUrl).pathname;
    }
  } catch {
    urlPath = entryPointUrl;
  }

  const prefix = '/assets/projects/';
  const idx = urlPath.indexOf(prefix);
  if (idx === -1) return null;

  // Expected: /assets/projects/<projectId>/rti/<assetId>/info.json
  const relative = urlPath.slice(idx + prefix.length);
  const segments = relative.split('/').filter(Boolean);

  if (segments.length < 4) return null;

  const [projectId, kind, assetId] = segments;
  if (kind !== 'rti') return null;

  return projectRtiAssetDir(projectId, assetId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Accept both canonical payloads ({ physicalObjectMetadata: {...} })
 * and legacy top-level metadata payloads.
 */
function extractPhysicalObjectMetadataPatch(rawBody: unknown): Partial<PhysicalObjectMetadata> {
  if (!isRecord(rawBody)) {
    return {};
  }

  if (isRecord(rawBody.physicalObjectMetadata)) {
    return toPhysicalObjectMetadataPatch(rawBody.physicalObjectMetadata, {
      allowExtraFields: true
    });
  }

  const legacyPayload: Record<string, unknown> = {};
  const acceptedLegacyKeys = ['sourceUri', 'sourceType', 'dublinCore', 'cidocCrm', 'sourceRecord'];
  for (const key of acceptedLegacyKeys) {
    if (rawBody[key] !== undefined) {
      legacyPayload[key] = rawBody[key];
    }
  }

  return toPhysicalObjectMetadataPatch(legacyPayload);
}

function mergePhysicalObjectMetadata(
  base: PhysicalObjectMetadata,
  patch: Partial<PhysicalObjectMetadata>
): PhysicalObjectMetadata {
  return {
    ...base,
    ...patch,
    dublinCore: patch.dublinCore ?? base.dublinCore,
    cidocCrm: patch.cidocCrm ?? base.cidocCrm
  };
}

function omitProtectedPhysicalObjectMetadataFields(
  patch: Partial<PhysicalObjectMetadata>
): Partial<PhysicalObjectMetadata> {
  const { sourceSelectionLocked: _sourceSelectionLocked, ...safePatch } = patch;
  return safePatch;
}

function withNormalizedPhysicalObjectMetadata<T extends { projectId: string; physicalObjectMetadata: PhysicalObjectMetadata }>(
  document: T
): T {
  return {
    ...document,
    physicalObjectMetadata: normalizePhysicalObjectMetadata(document.projectId, document.physicalObjectMetadata),
  };
}

function sendHdtError(
  req: Request,
  res: Response,
  status: number,
  code: keyof typeof API_ERROR_CODES.hdt,
  error: string,
  details?: unknown,
) {
  sendApiError(req, res, {
    status,
    code: API_ERROR_CODES.hdt[code],
    error,
    details,
  });
}

async function ignoreMissingMongoNamespace<T>(operation: Promise<T>): Promise<T | null> {
  try {
    return await operation;
  } catch (error: any) {
    const message = error?.message || '';
    if (error?.code === 26 || String(message).includes('ns does not exist')) {
      return null;
    }
    throw error;
  }
}

async function purgeSceneScopedAnnotations(projectId: string, sceneId: string) {
  const [geometries, dataRecords] = await Promise.all([
    ignoreMissingMongoNamespace(findAnnotationGeometriesByReference(projectId, 'scene', sceneId)),
    ignoreMissingMongoNamespace(findAnnotationDataByVisibility(projectId, 'scene', sceneId)),
  ]);

  const geometryIds = (geometries ?? []).map((geometry: any) => geometry.id);
  const dataIds = (dataRecords ?? []).map((data: any) => data.id);

  await Promise.all([
    ignoreMissingMongoNamespace(deleteAnnotationLinksByGeometryIds(projectId, geometryIds)),
    ignoreMissingMongoNamespace(deleteAnnotationLinksByDataIds(projectId, dataIds)),
    ignoreMissingMongoNamespace(deleteAnnotationGeometriesByReference(projectId, 'scene', sceneId)),
    ignoreMissingMongoNamespace(deleteAnnotationDataByVisibility(projectId, 'scene', sceneId)),
  ]);
}

async function purgeAssetScopedAnnotations(projectId: string, assetId: string) {
  const [geometries, dataRecords] = await Promise.all([
    ignoreMissingMongoNamespace(findAnnotationGeometriesByReference(projectId, 'asset', assetId)),
    ignoreMissingMongoNamespace(findAnnotationDataByVisibility(projectId, 'asset', assetId)),
  ]);

  const geometryIds = (geometries ?? []).map((geometry: any) => geometry.id);
  const dataIds = (dataRecords ?? []).map((data: any) => data.id);

  await Promise.all([
    ignoreMissingMongoNamespace(deleteAnnotationLinksByGeometryIds(projectId, geometryIds)),
    ignoreMissingMongoNamespace(deleteAnnotationLinksByDataIds(projectId, dataIds)),
    ignoreMissingMongoNamespace(deleteAnnotationGeometriesByReference(projectId, 'asset', assetId)),
    ignoreMissingMongoNamespace(deleteAnnotationDataByVisibility(projectId, 'asset', assetId)),
  ]);
}

// ============================================================================
// HDT DOCUMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/projects/:projectId/hdt
 * Retrieve the HDT document for a project from MongoDB.
 * Requires at least viewer role on the project (or sys_admin).
 */
export async function getHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    const document = await getHDTDocument(projectId);

    if (!document) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT document not found for this project');
    }

    const hasAccess = await checkIsViewerOrAboveOfProject(currentUser.sub, projectId);
    if (!hasAccess) {
      return sendHdtError(req, res, 403, 'editorOrManagerRequired', 'Access denied: viewer role or above required');
    }

    res.json(withNormalizedPhysicalObjectMetadata(document));
  } catch (error: any) {
    console.error('Error fetching HDT document:', error);
    sendHdtError(req, res, 500, 'fetchFailed', 'Failed to fetch HDT document', error?.message || String(error));
  }
}

/**
 * POST /api/projects/:projectId/hdt
 * Create/initialize the HDT document for a project (manager only).
 */
export async function createHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    // Check if user is manager of the project
    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'managerRequired', 'Only project managers can create HDT document');
    }

    // Check if document already exists
    const existing = await getHDTDocument(projectId);
    if (existing) {
      return sendHdtError(
        req,
        res,
        409,
        'alreadyExists',
        'HDT document already exists for this project',
        { document: existing },
      );
    }

    // Get project details to initialize metadata
    const prisma = getPrismaClient();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true
      }
    });

    if (!project) {
      return sendHdtError(req, res, 404, 'projectNotFound', 'Project not found');
    }

    // Use provided metadata from request body, or fallback to project defaults.
    // Accept canonical wrapper or legacy top-level payload.
    console.log('HDT CREATE: req.body:', JSON.stringify(req.body, null, 2));

    let metadataPatch: Partial<PhysicalObjectMetadata>;
    try {
      metadataPatch = omitProtectedPhysicalObjectMetadataFields(extractPhysicalObjectMetadataPatch(req.body));
    } catch (error: any) {
      return sendHdtError(
        req,
        res,
        400,
        'invalidPhysicalObjectMetadataPayload',
        error?.message || 'Invalid physical object metadata payload',
      );
    }

    const initialMetadata = normalizePhysicalObjectMetadata(projectId, metadataPatch, {
      defaults: {
        title: project.name,
        description: project.description || undefined
      },
      sourceSelectionLocked: false
    });

    console.log('HDT CREATE: initialMetadata:', JSON.stringify(initialMetadata, null, 2));

    // Create HDT document with metadata
    const document = await createHDTDocument(projectId, currentUser.sub, initialMetadata);
    console.log('HDT CREATE: created document:', JSON.stringify(document, null, 2));

    res.status(201).json(withNormalizedPhysicalObjectMetadata(document));
  } catch (error: any) {
    console.error('Error creating HDT document:', error);
    sendHdtError(req, res, 500, 'createFailed', 'Failed to create HDT document', error?.message || String(error));
  }
}

/**
 * PUT /api/projects/:projectId/hdt
 * Update HDT metadata (manager only).
 */
export async function updateHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);
    const rawBody = req.body;

    console.log('HDT UPDATE: req.body:', JSON.stringify(req.body, null, 2));
    console.log('HDT UPDATE: metadataUpdates:', JSON.stringify(rawBody, null, 2));

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'managerRequired', 'Only project managers can update HDT metadata');
    }

    const existingDocument = await getHDTDocument(projectId);
    if (!existingDocument) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT metadata not found for this project');
    }

    let metadataPatch: Partial<PhysicalObjectMetadata>;
    try {
      metadataPatch = omitProtectedPhysicalObjectMetadataFields(extractPhysicalObjectMetadataPatch(rawBody));
    } catch (error: any) {
      return sendHdtError(
        req,
        res,
        400,
        'invalidPhysicalObjectMetadataPayload',
        error?.message || 'Invalid physical object metadata payload',
      );
    }

    if (Object.keys(metadataPatch).length === 0) {
      return sendHdtError(req, res, 400, 'noPhysicalObjectMetadataFields', 'No physicalObjectMetadata fields provided');
    }

    const mergedCurrent = normalizePhysicalObjectMetadata(projectId, existingDocument.physicalObjectMetadata || {});
    const normalizedUpdate = mergePhysicalObjectMetadata(mergedCurrent, metadataPatch);
    const updatedMetadata = await updateHDTMetadata(projectId, normalizedUpdate, currentUser.sub);

    if (!updatedMetadata) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT metadata not found for this project');
    }

    res.json(withNormalizedPhysicalObjectMetadata(updatedMetadata));
  } catch (error: any) {
    console.error('Error updating HDT metadata:', error);
    sendHdtError(req, res, 500, 'updateFailed', 'Failed to update HDT metadata', error?.message || String(error));
  }
}

/**
 * POST /api/projects/:projectId/hdt/physical-object/import
 * Import physical object metadata from a source-specific adapter (manager only).
 */
export async function importPhysicalObjectMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'managerRequired', 'Only project managers can import physical object metadata');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    if (!isRecord(req.body)) {
      return sendHdtError(req, res, 400, 'bodyMustBeObject', 'Request body must be a JSON object');
    }

    const sourceUri =
      typeof req.body.sourceUri === 'string' && req.body.sourceUri.trim().length > 0
        ? req.body.sourceUri.trim()
        : '';

    if (!sourceUri) {
      return sendHdtError(req, res, 400, 'sourceUriRequired', 'sourceUri is required');
    }

    const sourceType = normalizePhysicalObjectSourceType(req.body.sourceType);
    const adapter = getPhysicalObjectImportAdapter(sourceType);

    const importResult = await adapter.importMetadata({
      sourceUri,
      payload: req.body.payload
    });

    const importPatch = toPhysicalObjectMetadataPatch(
      {
        sourceUri,
        sourceType,
        dublinCore: importResult.dublinCore,
        sourceRecord: importResult.sourceRecord,
        sourceSelectionLocked: true,
        ...(importResult.metadataPatch || {})
      },
      { allowExtraFields: true }
    );

    const existingDocument = await getHDTDocument(projectId);

    if (!existingDocument) {
      const prisma = getPrismaClient();
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          description: true
        }
      });

      if (!project) {
        return sendHdtError(req, res, 404, 'projectNotFound', 'Project not found');
      }

      const initialMetadata = normalizePhysicalObjectMetadata(projectId, importPatch, {
        defaults: {
          title: project.name,
          description: project.description || undefined
        },
        sourceSelectionLocked: true
      });

      const createdDocument = await createHDTDocument(projectId, currentUser.sub, initialMetadata);
      return res.status(201).json(withNormalizedPhysicalObjectMetadata(createdDocument));
    }

    const mergedCurrent = normalizePhysicalObjectMetadata(projectId, existingDocument.physicalObjectMetadata || {});
    const normalizedUpdate = normalizePhysicalObjectMetadata(
      projectId,
      mergePhysicalObjectMetadata(mergedCurrent, importPatch),
      { sourceSelectionLocked: true }
    );
    const updatedDocument = await updateHDTMetadata(projectId, normalizedUpdate, currentUser.sub);

    if (!updatedDocument) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT metadata not found for this project');
    }

    return res.status(200).json(withNormalizedPhysicalObjectMetadata(updatedDocument));
  } catch (error: any) {
    console.error('Error importing physical object metadata:', error);

    const message = error?.message || 'Failed to import physical object metadata';
    if (typeof message === 'string' && message.toLowerCase().includes('not implemented')) {
      return sendHdtError(req, res, 501, 'importNotImplemented', message);
    }
    if (typeof message === 'string' && message.toLowerCase().includes('source')) {
      return sendHdtError(req, res, 400, 'importSourceError', message);
    }

    return sendHdtError(req, res, 500, 'importFailed', 'Failed to import physical object metadata', message);
  }
}

/**
 * POST /api/projects/:projectId/hdt/physical-object/source-selection/re-enable
 * Re-enable metadata source selection for maintenance (system administrator only).
 */
export async function reEnablePhysicalObjectSourceSelectionHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!currentUser.sys_admin) {
      return sendHdtError(
        req,
        res,
        403,
        'managerRequired',
        'Only system administrators can re-enable metadata source selection'
      );
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    const existingDocument = await getHDTDocument(projectId);
    if (!existingDocument) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT metadata not found for this project');
    }

    const currentMetadata = normalizePhysicalObjectMetadata(projectId, existingDocument.physicalObjectMetadata || {});
    const updatedDocument = await updateHDTMetadata(
      projectId,
      {
        ...currentMetadata,
        sourceSelectionLocked: false,
      },
      currentUser.sub
    );

    if (!updatedDocument) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT metadata not found for this project');
    }

    return res.json(withNormalizedPhysicalObjectMetadata(updatedDocument));
  } catch (error: any) {
    console.error('Error re-enabling metadata source selection:', error);
    return sendHdtError(
      req,
      res,
      500,
      'updateFailed',
      'Failed to re-enable metadata source selection',
      error?.message || String(error)
    );
  }
}

/**
 * DELETE /api/projects/:projectId/hdt
 * Delete HDT document (manager only).
 */
export async function deleteHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!projectId) {
      return sendHdtError(req, res, 400, 'projectIdRequired', 'Project ID is required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'managerRequired', 'Only project managers can delete HDT document');
    }

    const deleted = await deleteHDTDocument(projectId);

    if (!deleted) {
      return sendHdtError(req, res, 404, 'documentNotFound', 'HDT document not found for this project');
    }

    res.json({ message: 'HDT document deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting HDT document:', error);
    sendHdtError(req, res, 500, 'deleteFailed', 'Failed to delete HDT document', error?.message || String(error));
  }
}

// ============================================================================
// DIGITAL ASSETS ENDPOINTS
// ============================================================================

/**
 * POST /api/projects/:projectId/hdt/assets
 * Add a digital asset record to the HDT pool (metadata only).
 *
 * Frontend provides minimal data, backend calculates:
 * - entryPointUrl (after upload)
 * - entryPoint (from filename)
 * - mimeType (from file)
 * - entrySize
 *
 * NOTE:
 * - For 3d-model, the binary file is uploaded via the "project files" endpoints
 *   and stored under:
 *     project_files/<projectId>/3d-model/<assetId>/<filename>
 * - For rti, the RTI upload route stores a full folder under:
 *     project_files/<projectId>/rti/<assetId>/(info.json + data...)
 */
export async function addAssetHandler(req: Request, res: Response) {
  const { projectId } = req.params;
  const currentUser = getCurrentUser(req);

  try {
    const body = req.body ?? {};

    // Accept the new DigitalAssetCreateRequest shape
    const normalizedAsset: DigitalAssetCreateRequest & { projectId: string } = {
      projectId,
      type: body.type,
      label: body.label,
      title: body.title,
      description: body.description,
      entryPointUrl: body.entryPointUrl, // Optional - backend can fill later
      entryPoint: body.entryPoint,       // Optional - backend can fill later
      mimeType: body.mimeType,           // Optional - backend can fill later
      entrySize: body.entrySize,           // Optional - backend can fill later
      metadata: body.metadata ?? {}
    };

    // Validate only the required fields that frontend must provide
    if (!normalizedAsset.type || typeof normalizedAsset.type !== 'string') {
      return sendHdtError(req, res, 400, 'assetInvalidType', 'Asset "type" is required');
    }
    if (!normalizedAsset.label || typeof normalizedAsset.label !== 'string') {
      return sendHdtError(req, res, 400, 'assetInvalidLabel', 'Asset "label" is required');
    }

    // Optional validation: if provided, these should be valid
    if (normalizedAsset.entryPointUrl !== undefined && typeof normalizedAsset.entryPointUrl !== 'string') {
      return sendHdtError(req, res, 400, 'assetInvalidEntryPointUrl', 'Asset "entryPointUrl" must be a string if provided');
    }
    if (normalizedAsset.entryPoint !== undefined && typeof normalizedAsset.entryPoint !== 'string') {
      return sendHdtError(req, res, 400, 'assetInvalidEntryPoint', 'Asset "entryPoint" must be a string if provided');
    }
    if (normalizedAsset.mimeType !== undefined && typeof normalizedAsset.mimeType !== 'string') {
      return sendHdtError(req, res, 400, 'assetInvalidMimeType', 'Asset "mimeType" must be a string if provided');
    }

    if (!currentUser) {
      // Audit authentication failure (best-effort).
      await auditBestEffort({
        req,
        userSub: 'system',
        action: 'hdt.asset.create',
        success: false,
        payload: {
          projectId,
          error: 'Authentication required'
        }
      });

      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      // Audit authorization failure (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.create',
        success: false,
        payload: {
          projectId,
          error: 'Unauthorized: not project manager',
          assetType: normalizedAsset.type,
          label: normalizedAsset.label,
          entryPointUrl: normalizedAsset.entryPointUrl ?? null
        }
      });

      return sendHdtError(req, res, 403, 'assetManagerRequired', 'Only project managers and system administrators can add assets');
    }

    const assetResult = await addDigitalAsset(projectId, normalizedAsset, currentUser.sub);

    if (!assetResult) {
      // Audit "not found" (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.create',
        success: false,
        payload: {
          projectId,
          error: 'HDT document not found',
          assetType: normalizedAsset.type,
          label: normalizedAsset.label,
          entryPointUrl: normalizedAsset.entryPointUrl ?? null
        }
      });

      return sendHdtError(req, res, 404, 'assetDocumentNotFound', 'HDT document not found');
    }

    // Audit success (best-effort).
    // Note: the asset id is usually assigned inside addDigitalAsset; if addDigitalAsset returns it,
    // prefer logging that id. Otherwise we log what we have (type/label/entryPointUrl).
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.create',
      success: true,
      payload: {
        projectId,
        assetType: normalizedAsset.type,
        label: normalizedAsset.label,
        title: normalizedAsset.title ?? null,
        entryPointUrl: normalizedAsset.entryPointUrl ?? null,
        entryPoint: normalizedAsset.entryPoint ?? null,
        mimeType: normalizedAsset.mimeType ?? null,
        entrySize: normalizedAsset.entrySize ?? null
      }
    });

    // Keep derived scene descriptions in sync (used by the viewer).
    await generateAllSceneFiles(projectId);

    return res.status(201).json({
      success: true,
      assetId: assetResult.assetId,
      value: assetResult.doc,
    });
  } catch (error: any) {
    // Audit unexpected failure (best-effort).
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.create',
      success: false,
      payload: {
        projectId,
        error: error?.message || String(error)
      }
    });

    console.error('Error adding asset:', error);
    return sendHdtError(req, res, 500, 'assetCreateFailed', 'Failed to add asset', error?.message || String(error));
  }
}

/**
 * PUT /api/projects/:projectId/hdt/assets/:assetId
 * Update a digital asset record (manager only).
 */
export async function updateAssetHandler(req: Request, res: Response) {
  const { projectId, assetId } = req.params;
  const currentUser = getCurrentUser(req);

  try {
    const updates = req.body;

    if (!currentUser) {
      // Audit authentication failure (best-effort).
      await auditBestEffort({
        req,
        userSub: 'system',
        action: 'hdt.asset.update',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'Authentication required'
        }
      });

      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      // Audit authorization failure (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.update',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'Unauthorized: not project manager',
          // Log the attempted changes at a high level (avoid logging huge/binary blobs).
          updateKeys: updates && typeof updates === 'object' ? Object.keys(updates) : null
        }
      });

      return sendHdtError(req, res, 403, 'assetManagerRequired', 'Only project managers and system administrators can update assets');
    }

    const updatedDoc = await updateDigitalAsset(projectId, assetId, updates, currentUser.sub);

    if (!updatedDoc) {
      // Audit not found (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.update',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'HDT document or asset not found',
          updateKeys: updates && typeof updates === 'object' ? Object.keys(updates) : null
        }
      });

      return sendHdtError(req, res, 404, 'assetOrDocumentNotFound', 'HDT document or asset not found');
    }

    // Audit success (best-effort).
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.update',
      success: true,
      payload: {
        projectId,
        assetId,
        updateKeys: updates && typeof updates === 'object' ? Object.keys(updates) : null
      }
    });

    await generateAllSceneFiles(projectId);

    return res.json(updatedDoc);
  } catch (error: any) {
    // Audit unexpected failure (best-effort).
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.update',
      success: false,
      payload: {
        projectId,
        assetId,
        error: error?.message || String(error)
      }
    });

    console.error('Error updating asset:', error);
    return sendHdtError(req, res, 500, 'assetUpdateFailed', 'Failed to update asset', error?.message || String(error));
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/assets/:assetId
 * Remove a digital asset from the HDT document (and from all scenes).
 *
 * Filesystem cleanup:
 * - If the asset is type "rti", remove the RTI folder:
 *     project_files/<projectId>/rti/<assetId>
 *
 * NOTE:
 * - 3d-model file cleanup is typically handled by the project files endpoints
 *   (or by a dedicated cleanup strategy if desired).
 */
export async function removeAssetHandler(req: Request, res: Response) {
  const { projectId, assetId } = req.params;
  const currentUser = getCurrentUser(req);

  try {
    if (!currentUser) {
      // Audit authentication failure (best-effort).
      await auditBestEffort({
        req,
        userSub: 'system',
        action: 'hdt.asset.update',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'Authentication required'
        }
      });

      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      // Audit authorization failure (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.delete',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'Unauthorized: not project manager'
        }
      });

      return sendHdtError(req, res, 403, 'assetManagerRequired', 'Only project managers and system administrators can remove assets');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    // 1) Retrieve current HDT document to inspect the asset before removal
    const hdtDoc = await getHDTDocument(projectId);
    if (!hdtDoc) {
      // Audit not found (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.delete',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'HDT document not found'
        }
      });

      return sendHdtError(req, res, 404, 'assetDocumentNotFound', 'HDT document not found');
    }

    const asset = Array.isArray((hdtDoc as any).digitalAssets)
      ? (hdtDoc as any).digitalAssets.find((a: any) => a.id === assetId)
      : undefined;

    if (!asset) {
      // Audit not found (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.delete',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'Asset not found in HDT document'
        }
      });

      return sendHdtError(req, res, 404, 'assetNotFound', 'Asset not found in HDT document');
    }

    await purgeAssetScopedAnnotations(projectId, assetId);

    console.log('🗑️ [removeAssetHandler] Deleting asset:', {
      projectId,
      assetId,
      type: asset.type,
      entryPointUrl: asset.entryPointUrl
    });

    // 2) Determine directory to delete based on asset type
    let assetDirToDelete: string | null = null;

    if (asset.type === '3d-model') {
      // 3D Model: project_files/<projectId>/3d-model/<assetId>/
      assetDirToDelete = projectModel3dAssetDir(projectId, assetId);
      console.log('📁 [removeAssetHandler] 3D asset directory to delete:', assetDirToDelete);

    } else if (asset.type === 'image') {
      assetDirToDelete = projectImageAssetDir(projectId, assetId);
    } else if (asset.type === 'rti') {
      // RTI: project_files/<projectId>/rti/<assetId>/
      assetDirToDelete = projectRtiAssetDir(projectId, assetId);
      console.log('📁 [removeAssetHandler] RTI asset directory to delete:', assetDirToDelete);

      // Fallback: try to resolve from fileUrl if standard path doesn't work
      if (!assetDirToDelete && typeof asset.entryPointUrl === 'string') {
        assetDirToDelete = resolveRtiAssetDirectory(asset.entryPointUrl) || null;
        console.log('📁 [removeAssetHandler] RTI fallback directory:', assetDirToDelete);
      }
    }

    // 3) Remove asset from HDT document (DB + scenes)
    console.log('📝 [removeAssetHandler] Removing from HDT document...');
    const updatedDoc = await removeDigitalAsset(projectId, assetId, currentUser.sub);
    if (!updatedDoc) {
      // Audit unexpected missing doc after removal attempt (best-effort).
      await auditBestEffort({
        req,
        userSub: currentUser?.sub ?? 'system',
        action: 'hdt.asset.delete',
        success: false,
        payload: {
          projectId,
          assetId,
          error: 'HDT document not found after removal',
          assetType: asset.type,
          label: asset.label ?? null,
          entryPointUrl: asset.entryPointUrl ?? null
        }
      });

      return sendHdtError(req, res, 404, 'assetDocumentMissingAfterRemoval', 'HDT document not found after removal');
    }

    // 4) Remove asset directory from filesystem if it exists
    let filesystemRemoved = false;
    let filesystemError: string | null = null;

    if (assetDirToDelete) {
      try {
        // Check if directory exists first
        await fs.access(assetDirToDelete);

        // Remove directory and all contents
        await fs.rm(assetDirToDelete, { recursive: true, force: true });

        filesystemRemoved = true;

        console.log('✅ [removeAssetHandler] Asset directory removed successfully:', {
          projectId,
          assetId,
          type: asset.type,
          directory: assetDirToDelete
        });
      } catch (fsErr: any) {
        filesystemError = fsErr?.message || String(fsErr);

        console.warn('⚠️ [removeAssetHandler] Failed to remove asset directory:', {
          projectId,
          assetId,
          type: asset.type,
          directory: assetDirToDelete,
          error: filesystemError
        });

        // Continue with response - don't block deletion if filesystem cleanup fails
        // This allows recovery from partial deletions
      }
    } else {
      console.warn('⚠️ [removeAssetHandler] No directory identified for deletion:', {
        projectId,
        assetId,
        type: asset.type
      });
    }

    // 5) Regenerate derived scene descriptions used by the viewer
    console.log('🔄 [removeAssetHandler] Regenerating scene files...');
    let sceneFilesRegenerated = false;
    let sceneRegenError: string | null = null;

    try {
      await generateAllSceneFiles(projectId);
      sceneFilesRegenerated = true;
    } catch (sceneErr: any) {
      sceneRegenError = sceneErr?.message || String(sceneErr);

      console.warn('⚠️ [removeAssetHandler] Failed to regenerate scene files:', sceneRegenError);
      // Continue - scene regeneration failure shouldn't block deletion
    }

    // Audit success (best-effort).
    // Note: we log filesystem + scene regeneration outcomes for post-mortem debugging.
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.delete',
      success: true,
      payload: {
        projectId,
        assetId,
        assetType: asset.type,
        label: asset.label ?? null,
        title: asset.title ?? null,
        entryPointUrl: asset.entryPointUrl ?? null,
        directory: assetDirToDelete,
        filesystemRemoved,
        filesystemError,
        sceneFilesRegenerated,
        sceneRegenError
      }
    });

    console.log('✅ [removeAssetHandler] Asset deletion completed:', {
      projectId,
      assetId,
      type: asset.type
    });

    return res.json({
      success: true,
      message: `Asset "${asset.label || assetId}" deleted successfully`,
      updatedDoc
    });

  } catch (error: any) {
    // Audit unexpected failure (best-effort).
    await auditBestEffort({
      req,
      userSub: currentUser?.sub ?? 'system',
      action: 'hdt.asset.delete',
      success: false,
      payload: {
        projectId,
        assetId,
        error: error?.message || String(error)
      }
    });

    console.error('❌ [removeAssetHandler] Error removing asset:', {
      error: error.message || String(error),
      stack: error.stack
    });

    return sendHdtError(req, res, 500, 'assetDeleteFailed', 'Failed to remove asset', error?.message || String(error));
  }
}

// ============================================================================
// SCENE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/projects/:projectId/scenes
 * List all available scene IDs (source of truth is MongoDB).
 */
export async function listScenesHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;

    const scenes = await getAvailableScenes(projectId);

    res.json(scenes);
  } catch (error: any) {
    console.error('Error listing scenes:', error);
    sendHdtError(req, res, 500, 'listScenesFailed', 'Failed to list scenes', error?.message || String(error));
  }
}

/**
 * POST /api/projects/:projectId/hdt/scenes
 * Create a new scene (manager only).
 * Scene data is stored in MongoDB inside the HDT document.
 */
export async function createSceneHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);
    const sceneData = req.body;

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers can create scenes');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    const updatedDoc = await addScene(projectId, sceneData, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneDocumentNotFound', 'HDT document not found');
    }

    const newScene = updatedDoc.scenes[updatedDoc.scenes.length - 1];

    // Keep derived scene description in sync (viewer reads /api/projects/:projectId/scenes/:sceneId).
    await generateSceneFile(projectId, newScene.id);

    res.status(201).json(updatedDoc);
  } catch (error: any) {
    console.error('Error creating scene:', error);
    sendHdtError(req, res, 500, 'sceneCreateFailed', 'Failed to create scene', error?.message || String(error));
  }
}

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId
 * Update a scene (manager only).
 * Scene data is stored in MongoDB inside the HDT document.
 */
export async function updateSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);
    const updates = req.body;

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers can update scenes');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    const updatedDoc = await updateScene(projectId, sceneId, updates, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneOrDocumentNotFound', 'HDT document or scene not found');
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error updating scene:', error);
    sendHdtError(req, res, 500, 'sceneUpdateFailed', 'Failed to update scene', error?.message || String(error));
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId
 * Delete a scene (manager only).
 * Scene data is removed from MongoDB (HDT document).
 *
 * NOTE:
 * If you also persist debug exports on disk, you may optionally remove them here.
 */
export async function deleteSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers can delete scenes');
    }

    if (!(await requireOwnedExclusiveStructuringLock(req, res, projectId))) {
      return;
    }

    await purgeSceneScopedAnnotations(projectId, sceneId);

    const updatedDoc = await removeScene(projectId, sceneId, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneDocumentNotFound', 'HDT document not found');
    }

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error deleting scene:', error);
    sendHdtError(req, res, 500, 'sceneDeleteFailed', 'Failed to delete scene', error?.message || String(error));
  }
}

// ============================================================================
// SCENE-ASSET ASSOCIATION ENDPOINTS
// ============================================================================

/**
 * POST /api/projects/:projectId/hdt/scenes/:sceneId/assets
 * Add an asset reference to a scene (project manager or system administrator only).
 * This updates MongoDB and then refreshes the derived scene description.
 */
export async function addAssetToSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);
    const assetReference = req.body;

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers and system administrators can modify scenes');
    }

    const updatedDoc = await addAssetToScene(projectId, sceneId, assetReference, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneDocumentNotFound', 'HDT document not found');
    }

    await generateSceneFile(projectId, sceneId);

    res.status(201).json(updatedDoc);
  } catch (error: any) {
    console.error('Error adding asset to scene:', error);
    sendHdtError(req, res, 500, 'sceneModifyFailed', 'Failed to add asset to scene', error?.message || String(error));
  }
}

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Update a scene-asset reference (project manager or system administrator only), then refresh derived scene description.
 */
export async function updateAssetInSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId, assetId } = req.params;
    const currentUser = getCurrentUser(req);
    const updatesResult = sceneAssetReferenceUpdateSchema.safeParse(req.body);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    if (!updatesResult.success) {
      return sendApiError(req, res, {
        status: 400,
        code: API_ERROR_CODES.common.validationError,
        error: 'Invalid scene asset update payload',
        details: formatZodIssues(updatesResult.error),
      });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers and system administrators can modify scenes');
    }

    const updatedDoc = await updateAssetInScene(projectId, sceneId, assetId, updatesResult.data, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneDocumentNotFound', 'HDT document not found');
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error updating asset in scene:', error);
    sendHdtError(req, res, 500, 'sceneModifyFailed', 'Failed to update asset in scene', error?.message || String(error));
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Remove an asset reference from a scene (project manager or system administrator only), then refresh derived scene description.
 */
export async function removeAssetFromSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId, assetId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return sendHdtError(req, res, 401, 'authenticationRequired', 'Authentication required');
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return sendHdtError(req, res, 403, 'sceneManagerRequired', 'Only project managers and system administrators can modify scenes');
    }

    const updatedDoc = await removeAssetFromScene(projectId, sceneId, assetId, currentUser.sub);
    if (!updatedDoc) {
      return sendHdtError(req, res, 404, 'sceneDocumentNotFound', 'HDT document not found');
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error removing asset from scene:', error);
    sendHdtError(req, res, 500, 'sceneModifyFailed', 'Failed to remove asset from scene', error?.message || String(error));
  }
}

// ============================================================================
// SCENE JSON (VIEWER + DEBUG EXPORT)
// ============================================================================

/**
 * GET /api/projects/:projectId/scenes/:sceneId
 * Returns a viewer-friendly scene description JSON.
 *
 * Source of truth:
 * - Scene definitions are stored in MongoDB (HDT document).
 *
 * This handler generates (or regenerates) a derived scene description from MongoDB
 * and returns it to the client. The returned JSON includes resolved asset URLs
 * (e.g. /assets/projects/<projectId>/3d-model/<assetId>/<filename>).
 *
 * NOTE:
 * Even if you also export scene JSON to disk for debugging, the viewer should
 * rely on this endpoint.
 */
export async function getSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    // ✅ SOLUZIONE: Se richiesta "default", trova scena con isDefault=true
    let targetSceneId = sceneId;

    if (sceneId === 'default') {
      // Trova la scena default reale
      const doc = await getHDTDocument(projectId);
      if (!doc) {
        return sendHdtError(req, res, 404, 'projectNotFound', 'Project not found');
      }

      const defaultScene = doc.scenes?.find((s: any) => s.isDefault === true);
      if (!defaultScene) {
        return sendHdtError(req, res, 404, 'defaultSceneNotFound', 'No default scene found');
      }

      targetSceneId = defaultScene.id;
      console.log(`🎯 [SceneFile] Mapping 'default' to scene ID: ${targetSceneId}`);
    }

    const sceneDesc = await generateSceneFile(projectId, targetSceneId);
    if (sceneDesc) {
      return res.json(sceneDesc);
    }

    return sendHdtError(req, res, 404, 'sceneNotFound', 'Scene not found in database');
  } catch (error: any) {
    console.error('Error serving scene file:', error);
    sendHdtError(req, res, 500, 'sceneModifyFailed', 'Failed to serve scene file', error?.message || String(error));
  }
}

/**
 * GET /api/projects/:projectId/scenes/:sceneId/export
 * Export a scene JSON description to disk and download it (debugging only).
 *
 * If you keep exported files on disk and want multiple scenes, a clean layout is:
 *   project_files/<projectId>/scenes/<sceneId>.json
 *
 * But this export is optional: scenes are already stored in MongoDB.
 */
export async function exportSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    if (!projectId || !sceneId) {
      return sendHdtError(req, res, 400, 'projectAndSceneIdRequired', 'Project ID and Scene ID are required');
    }

    const sceneDesc = await generateSceneFile(projectId, sceneId);
    if (!sceneDesc) {
      return sendHdtError(req, res, 404, 'sceneNotFound', 'Scene not found');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${projectId}-${sceneId}.json"`);
    res.json(sceneDesc);
  } catch (error: any) {
    console.error('Error exporting scene:', error);
    sendHdtError(req, res, 500, 'sceneModifyFailed', 'Failed to export scene', error?.message || String(error));
  }
}
