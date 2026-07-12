// src/controllers/unified-asset-upload.controller.ts

import express from 'express';
import type { Response } from 'express';
import type { AssetProcessingRequest } from '../middleware/unified-asset-upload-middleware.js';
import fse from 'fs-extra';
import { RoleEnum } from '@prisma/client';
import {
  ensureProjectSkeleton,
} from '../utils/project-static-paths.js';
import { getPrismaClient } from '../../db.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';
import type { PreparedAssetProcessing } from '../services/asset-ingestion.service.js';
import {
  prepareAssetProcessingFromLocalFile,
} from '../services/asset-ingestion.service.js';
import {
  AssetTypeMismatchError,
  ingestPreparedAssetIntoExistingAsset,
  ingestRemoteAssetIntoExistingAsset,
} from '../services/remote-asset-ingestion.service.js';
import { getPublicBaseUrl } from '../utils/public-base-url.js';

/**
 * Check whether the authenticated user is manager of a project (or sysadmin).
 */
async function checkIsManagerOfProject(userSub: string, projectId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { sub: userSub },
    select: { id: true, sys_admin: true }
  });

  if (!user) return false;
  if (user.sys_admin) return true;

  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: RoleEnum.manager
    },
    select: { id: true }
  });

  return !!role;
}

function statusForRemoteImportError(error: unknown) {
  if (error instanceof AssetTypeMismatchError) {
    return 409;
  }
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('sourceUrl')
    || message.includes('private or disallowed network address')
    || message.includes('disallowed host')
  ) {
    return 400;
  }

  if (
    message.includes('Remote server responded with HTTP')
    || message.includes('Remote server returned')
    || message.includes('download timed out')
  ) {
    return 502;
  }

  return 500;
}

function parseOptionalBasicAuthPayload(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: true as const, value: null };
  }

  const authType = 'authType' in body ? (body as Record<string, unknown>).authType : undefined;
  const username = 'username' in body ? (body as Record<string, unknown>).username : undefined;
  const password = 'password' in body ? (body as Record<string, unknown>).password : undefined;

  if (authType === undefined || authType === null || authType === '' || authType === 'none') {
    return { ok: true as const, value: null };
  }

  if (authType !== 'basic') {
    return { ok: false as const, error: 'authType must be either "none" or "basic".' };
  }

  if (typeof username !== 'string' || !username.trim()) {
    return { ok: false as const, error: 'username is required when authType is "basic".' };
  }

  if (typeof password !== 'string') {
    return { ok: false as const, error: 'password is required when authType is "basic".' };
  }

  return {
    ok: true as const,
    value: {
      username: username.trim(),
      password,
    },
  };
}

/**
 * Unified asset upload controller.
 *
 * The middleware classifies uploads into:
 * - 'image-direct': a directly viewable raster image
 * - '3d-direct': a single 3D file
 * - '3d': a ZIP containing one or more 3D files
 * - 'rti': a ZIP containing a relightable dataset package (`info.json` at archive root)
 *
 * IMPORTANT CONTRACT:
 * We do NOT publish `fileUrl` anymore.
 * We publish:
 * - entryPointUrl: public URL to open the asset (image, 3D model, or RTI info.json)
 * - entryPoint: public path (relative) to the entry point (optional convenience)
 */
export async function unifiedAssetUploadHandler(req: express.Request, res: express.Response) {
  const assetReq = req as AssetProcessingRequest;
  const cleanupPaths: string[] = [];

  try {
    const response = await processPreparedAssetIngestionRequest(req, res, assetReq.assetProcessing, cleanupPaths);
    await cleanupFiles(cleanupPaths);
    return response;
  } catch (error: unknown) {
    console.error('[UnifiedUpload] Error processing upload:', error);
    await cleanupFiles(cleanupPaths);

    return res.status(500).json({
      error: 'Failed to process upload.',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Register a remote OpenLIME image URL or download a 3D/RTI asset for ingestion.
 */
export async function unifiedAssetImportFromUrlHandler(req: express.Request, res: express.Response) {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    const assetIdRaw = req.body?.assetId;
    const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required.' });
    }

    const sourceUrlRaw = req.body?.sourceUrl;
    const sourceUrl = typeof sourceUrlRaw === 'string' ? sourceUrlRaw.trim() : '';
    if (!sourceUrl) {
      return res.status(400).json({ error: 'sourceUrl is required.' });
    }

    const authParse = parseOptionalBasicAuthPayload(req.body);
    if (!authParse.ok) {
      return res.status(400).json({ error: authParse.error });
    }

    const currentUserSub = (req as any).user?.sub;
    if (!currentUserSub) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const isManager = await checkIsManagerOfProject(currentUserSub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers and system administrators can upload files.' });
    }

    const hdtDoc = await getHDTDocument(projectId);
    if (!hdtDoc) {
      return res.status(404).json({ error: 'HDT document not found for this project.' });
    }

    const existingAsset = (hdtDoc.digitalAssets || []).find((asset: any) => asset.id === assetId);
    if (!existingAsset) {
      return res.status(404).json({ error: `Asset "${assetId}" not found in HDT document.` });
    }

    const result = await ingestRemoteAssetIntoExistingAsset({
      projectId,
      assetId,
      sourceUrl,
      userId: currentUserSub,
      publicBaseUrl: getPublicBaseUrl(req),
      auth: authParse.value,
      expectedAssetType: existingAsset.type,
    });

    return res.status(201).json({
      success: true,
      value: result,
    });
  } catch (error: unknown) {
    console.error('[UnifiedUpload] Error importing remote asset:', error);

    return res.status(statusForRemoteImportError(error)).json({
      error: 'Failed to import remote asset.',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function processPreparedAssetIngestionRequest(
  req: express.Request,
  res: express.Response,
  assetProcessing: PreparedAssetProcessing,
  cleanupPaths: string[],
) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required.' });
  }

  const assetIdRaw = req.body?.assetId;
  const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
  if (!assetId) {
    return res.status(400).json({ error: 'assetId is required.' });
  }

  const currentUserSub = (req as any).user?.sub;
  if (!currentUserSub) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { type, originalFile, extractedPath, detectedFiles, primaryModelFile, warnings = [] } = assetProcessing;

  const isManager = await checkIsManagerOfProject(currentUserSub, projectId);
  if (!isManager) {
    return res.status(403).json({ error: 'Only project managers and system administrators can upload files.' });
  }

  const hdtDoc = await getHDTDocument(projectId);
  if (!hdtDoc) {
    return res.status(404).json({ error: 'HDT document not found for this project.' });
  }

  const existingAsset = (hdtDoc.digitalAssets || []).find((asset: any) => asset.id === assetId);
  if (!existingAsset) {
    return res.status(404).json({ error: `Asset "${assetId}" not found in HDT document.` });
  }

  const expectedType = type === 'rti' ? 'rti' : type === 'image-direct' ? 'image' : '3d-model';
  if (existingAsset.type !== expectedType && existingAsset.type !== 'other') {
    return res.status(409).json({
      error: `Asset type mismatch: upload is "${expectedType}" but asset "${assetId}" is "${existingAsset.type}".`,
    });
  }

  console.log(`🚀 [UnifiedUpload] Processing ${type} upload for project ${projectId}, asset ${assetId}`);

  ensureProjectSkeleton(projectId);

  const result = await ingestPreparedAssetIntoExistingAsset({
    projectId,
    assetId,
    userId: currentUserSub,
    publicBaseUrl: getPublicBaseUrl(req),
    sourceUrl: '',
    assetProcessing: {
      type,
      originalFile,
      extractedPath,
      detectedFiles,
      primaryModelFile,
      warnings,
      rtiDatasetRootRelativePath: assetProcessing.rtiDatasetRootRelativePath,
    },
    cleanupTargets: cleanupPaths,
  });

  return res.status(201).json({
    success: true,
    value: result,
  });
}

/**
 * Cleanup helper: best-effort removal of temporary files/dirs.
 */
async function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    try {
      await fse.remove(p);
    } catch {
      // Ignore cleanup errors
    }
  }
}
