// src/controllers/unified-asset-upload.controller.ts

import express from 'express';
import type { Response } from 'express';
import type { AssetProcessingRequest } from '../middleware/unified-asset-upload-middleware.js';
import path from 'path';
import fsp from 'fs/promises';
import fse from 'fs-extra';
import {
  ensureProjectSkeleton,
  projectModel3dAssetDir,
  projectRtiAssetDir
} from '../utils/project-static-paths.js';
import { updateDigitalAsset } from '../services/hdt-metadata.service.js';

/**
 * Build the public base URL for assets.
 * - Supports reverse proxies via X-Forwarded-* headers
 * - Supports explicit override via PUBLIC_BASE_URL (recommended in Docker)
 */
function getPublicBaseUrl(req: any): string {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const forwardedHost = req.get('X-Forwarded-Host');
  const forwardedProto = req.get('X-Forwarded-Proto') || 'http';
  const forwardedPort = req.get('X-Forwarded-Port');

  if (forwardedHost) {
    const hasPort = forwardedHost.includes(':');
    const host = hasPort
      ? forwardedHost
      : (forwardedPort ? `${forwardedHost}:${forwardedPort}` : forwardedHost);
    return `${forwardedProto}://${host}`;
  }

  const protocol = req.secure ? 'https' : 'http';
  const host = req.get('Host') || 'localhost:3002';
  return `${protocol}://${host}`;
}

/**
 * Compute the total size of a directory (recursive).
 * This is used for RTI assets after unzip, because the ZIP size is not representative.
 */
async function getDirectorySizeBytes(dir: string): Promise<number> {
  let total = 0;

  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await getDirectorySizeBytes(full);
    } else if (e.isFile()) {
      try {
        const st = await fsp.stat(full);
        total += st.size;
      } catch {
        // Ignore stat errors (rare, but keep the upload stable)
      }
    }
  }

  return total;
}

/**
 * Unified asset upload controller.
 *
 * The middleware classifies uploads into:
 * - '3d-direct': a single 3D file
 * - '3d': a ZIP containing one or more 3D files
 * - 'rti': a ZIP containing RTI dataset (info.json + tiles/images/etc.)
 *
 * IMPORTANT CONTRACT:
 * We do NOT publish `fileUrl` anymore.
 * We publish:
 * - entryPointUrl: public URL to open the asset (3d model file OR rti info.json)
 * - entryPoint: public path (relative) to the entry point (optional convenience)
 */
export async function unifiedAssetUploadHandler(req: express.Request, res: express.Response) {
  const assetReq = req as AssetProcessingRequest;
  const cleanupPaths: string[] = [];

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

    // Extract userId from authenticated request (consistent with other controllers)
    const userId = (req as any).user?.sub || 'system';

    const { assetProcessing } = assetReq;
    const { type, originalFile, extractedPath, detectedFiles } = assetProcessing;

    console.log(`🚀 [UnifiedUpload] Processing ${type} upload for project ${projectId}, asset ${assetId}`);

    ensureProjectSkeleton(projectId);

    // Track cleanup paths
    cleanupPaths.push(originalFile.path);
    if (extractedPath) cleanupPaths.push(extractedPath);

    switch (type) {
      case '3d-direct':
        return await handle3DDirectUpload(req, projectId, assetId, originalFile, userId, res, cleanupPaths);

      case '3d':
        return await handle3DFromZipUpload(req, projectId, assetId, extractedPath!, detectedFiles!, userId, res, cleanupPaths);

      case 'rti':
        return await handleRTIUpload(req, projectId, assetId, extractedPath!, originalFile, userId, res, cleanupPaths);

      default:
        return res.status(400).json({ error: `Unsupported upload type: ${type}` });
    }
  } catch (error: any) {
    console.error('[UnifiedUpload] Error processing upload:', error);
    await cleanupFiles(cleanupPaths);

    return res.status(500).json({
      error: 'Failed to process upload.',
      message: error?.message ?? String(error),
    });
  }
}

/**
 * Handle direct 3D model upload (non-ZIP).
 * Storage:
 *   project_files/<projectId>/3d-model/<assetId>/<filename>
 * Public:
 *   /assets/projects/<projectId>/3d-model/<assetId>/<filename>
 */
async function handle3DDirectUpload(
  req: any,
  projectId: string,
  assetId: string,
  file: Express.Multer.File,
  userId: string,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  const targetDir = projectModel3dAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, file.originalname);
  await fsp.rename(file.path, targetPath);

  // Remove from cleanup list since it has been moved
  const idx = cleanupPaths.indexOf(file.path);
  if (idx >= 0) cleanupPaths.splice(idx, 1);

  const st = await fsp.stat(targetPath);

  const baseUrl = getPublicBaseUrl(req);
  const entryPoint = `/assets/projects/${encodeURIComponent(projectId)}/3d-model/${encodeURIComponent(assetId)}/${encodeURIComponent(file.originalname)}`;
  const entryPointUrl = `${baseUrl}${entryPoint}`;

  console.log(`✅ [UnifiedUpload] Direct 3D model uploaded: ${entryPointUrl}`);

  // Update HDT digital asset metadata (entryPointUrl is the new contract)
  await updateDigitalAsset(projectId, assetId, {
    type: '3d-model',
    mimeType: file.mimetype,
    fileSize: st.size,
    entryPointUrl,
    entryPoint
  }, userId);

  return res.status(201).json({
    success: true,
    value: {
      projectId,
      assetId,
      type: '3d-model',
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: st.size,
      entryPointUrl,
      entryPoint,
      storageDir: targetDir,
    }
  });
}

/**
 * Handle 3D models extracted from ZIP.
 * Storage:
 *   project_files/<projectId>/3d-model/<assetId>/(all extracted files)
 * Public entry point:
 *   the first detected 3D model file (can be improved later with better heuristics)
 */
async function handle3DFromZipUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  detectedFiles: Array<{ name: string; path: string; type: string }>,
  userId: string,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  const targetDir = projectModel3dAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  await fse.copy(extractedPath, targetDir);

  const modelFiles = detectedFiles.filter(f => f.type === '3d-model');
  const mainModelFile = modelFiles[0];
  if (!mainModelFile) {
    throw new Error('No 3D model files found in ZIP archive');
  }

  // Compute total size AFTER extraction (stable and matches what we store)
  const totalSize = await getDirectorySizeBytes(targetDir);

  const baseUrl = getPublicBaseUrl(req);
  const entryPoint = `/assets/projects/${encodeURIComponent(projectId)}/3d-model/${encodeURIComponent(assetId)}/${encodeURIComponent(mainModelFile.name)}`;
  const entryPointUrl = `${baseUrl}${entryPoint}`;

  console.log(`✅ [UnifiedUpload] 3D ZIP processed, entry: ${entryPointUrl}`);

  await updateDigitalAsset(projectId, assetId, {
    type: '3d-model',
    fileSize: totalSize,
    entryPointUrl,
    entryPoint
  }, userId);

  return res.status(201).json({
    success: true,
    value: {
      projectId,
      assetId,
      type: '3d-model',
      fileName: mainModelFile.name,
      fileSize: totalSize,
      entryPointUrl,
      entryPoint,
      storageDir: targetDir,
      additionalFiles: detectedFiles.map(f => ({ name: f.name, type: f.type })),
    }
  });
}

/**
 * Handle RTI upload (ZIP).
 * Storage:
 *   project_files/<projectId>/rti/<assetId>/(info.json + tiles/images/...)
 * Public entry point:
 *   /assets/projects/<projectId>/rti/<assetId>/info.json
 */
async function handleRTIUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  originalFile: Express.Multer.File,
  userId: string,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  const targetDir = projectRtiAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  await fse.copy(extractedPath, targetDir);

  // Validate that info.json exists
  const infoJsonPath = path.join(targetDir, 'info.json');
  const infoExists = await fse.pathExists(infoJsonPath);
  if (!infoExists) {
    throw new Error('RTI archive missing required info.json at dataset root');
  }

  // Compute total dataset size AFTER extraction (this fixes fileSize=0)
  const totalSize = await getDirectorySizeBytes(targetDir);

  const baseUrl = getPublicBaseUrl(req);
  const entryPoint = `/assets/projects/${encodeURIComponent(projectId)}/rti/${encodeURIComponent(assetId)}/info.json`;
  const entryPointUrl = `${baseUrl}${entryPoint}`;

  console.log(`✅ [UnifiedUpload] RTI ZIP processed, entry: ${entryPointUrl}`);

  await updateDigitalAsset(projectId, assetId, {
    metadata: {
      rtiType: 'hsh',
      rtiLayout: 'deepzoom',
      zipName: originalFile.originalname
    }
  }, userId);

  return res.status(201).json({
    success: true,
    value: {
      projectId,
      assetId,
      type: 'rti',
      fileName: originalFile.originalname,
      mimeType: originalFile.mimetype,
      fileSize: totalSize,
      entryPointUrl,
      entryPoint,
      storageDir: targetDir,
    }
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
