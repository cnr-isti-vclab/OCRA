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

/**
 * Get the base URL for public assets based on request.
 * Handles Docker/nginx reverse proxy correctly.
 */
function getPublicBaseUrl(req: any): string {
  // 0) Explicit override (best for Docker)
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const forwardedHost = req.get('X-Forwarded-Host');
  const forwardedProto = req.get('X-Forwarded-Proto') || 'http';
  const forwardedPort = req.get('X-Forwarded-Port');

  if (forwardedHost) {
    // If forwardedHost already includes a port, keep it; otherwise append forwardedPort if present
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
 * Best-effort extraction of label/title from request body with reasonable fallbacks.
 * Keep this small and predictable to avoid surprising API behavior.
 */
function getLabelAndTitle(req: any, fallbackBaseName: string): { label: string; title: string } {
  const rawLabel = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

  const label = rawLabel || rawTitle || fallbackBaseName;
  const title = rawTitle || rawLabel || fallbackBaseName;

  return { label, title };
}

/**
 * Infer a basic "format" from filename extension (without leading dot).
 * Returns undefined if not available.
 */
function inferFormatFromFilename(name: string): string | undefined {
  const ext = path.extname(name).replace('.', '').toLowerCase();
  return ext || undefined;
}

/**
 * Cleanup temporary files/directories.
 */
async function cleanupFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(
    paths.map(async (filePath) => {
      try {
        await fse.remove(filePath);
      } catch (err) {
        console.warn(`Failed to cleanup path: ${filePath}`, err);
      }
    })
  );
}

/**
 * Unified asset upload controller.
 *
 * Handles uploads processed by unifiedAssetUploadMiddleware:
 * - Direct 3D model files
 * - ZIP archives containing RTI data
 * - ZIP archives containing 3D models
 *
 * IMPORTANT:
 * This controller returns a normalized "DigitalAsset-like" payload:
 * - 3D: { type:'3d-model', entryPointUrl, entryPoint, mimeType, fileSize, metadata? }
 * - RTI: { type:'rti', entryPointUrl, entryPoint:'info.json', mimeType:'application/json', fileSize, metadata:{ rtiFormat, zipName } }
 *
 * It does NOT return legacy fields (uploadResponse, fileUrl/filePath/storageDir, etc.).
 */
export async function unifiedAssetUploadHandler(req: express.Request, res: express.Response) {
  const assetReq = req as AssetProcessingRequest;
  let cleanupPaths: string[] = [];

  try {
    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ error: 'Project ID is required.' });

    const assetIdRaw = req.body?.assetId;
    const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
    if (!assetId) return res.status(400).json({ error: 'assetId is required.' });

    const { assetProcessing } = assetReq;
    const { type, originalFile, extractedPath, detectedFiles } = assetProcessing;

    ensureProjectSkeleton(projectId);

    // tmp cleanup targets
    cleanupPaths.push(originalFile.path);
    if (extractedPath) cleanupPaths.push(extractedPath);

    let response: Response;

    switch (type) {
      case '3d-direct':
        response = await handle3DDirectUpload(req, projectId, assetId, originalFile, res, cleanupPaths);
        break;

      case '3d':
        response = await handle3DFromZipUpload(req, projectId, assetId, extractedPath!, detectedFiles!, res, cleanupPaths);
        break;

      case 'rti':
        response = await handleRTIUpload(req, projectId, assetId, extractedPath!, originalFile, res, cleanupPaths);
        break;

      default:
        throw new Error(`Unsupported asset processing type: ${(type as any)}`);
    }

    // Cleanup on success
    await cleanupFiles(cleanupPaths);
    return response;

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
 */
async function handle3DDirectUpload(
  req: any,
  projectId: string,
  assetId: string,
  file: Express.Multer.File,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  // Final destination directory for this 3D asset
  const targetDir = projectModel3dAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  // Move file to final location
  const targetPath = path.join(targetDir, file.originalname);
  await fsp.rename(file.path, targetPath);

  // Remove from cleanup list since it's been moved
  const fileIndex = cleanupPaths.indexOf(file.path);
  if (fileIndex > -1) cleanupPaths.splice(fileIndex, 1);

  // Get file stats
  const stats = await fsp.stat(targetPath);

  // Public URL for the 3D model file (absolute URL)
  const baseUrl = getPublicBaseUrl(req);
  const entryPointUrl =
    `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}` +
    `/3d-model/${encodeURIComponent(assetId)}/${encodeURIComponent(file.originalname)}`;

  const fallbackName = path.parse(file.originalname).name || file.originalname;
  const { label, title } = getLabelAndTitle(req, fallbackName);

  console.log(`✅ [UnifiedUpload] Direct 3D model uploaded: ${entryPointUrl}`);

  return res.status(201).json({
    success: true,
    value: {
      type: '3d-model',
      projectId,
      id: assetId,
      label,
      title,
      entryPointUrl,
      entryPoint: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      fileSize: stats.size,
      metadata: {
        format: inferFormatFromFilename(file.originalname)
      }
    }
  });
}

/**
 * Handle 3D models extracted from ZIP.
 */
async function handle3DFromZipUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  detectedFiles: Array<{ name: string; path: string; type: string }>,
  res: Response,
  _cleanupPaths: string[]
): Promise<Response> {
  // Final destination directory for this 3D asset
  const targetDir = projectModel3dAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  // Copy all files from extracted ZIP to target directory
  await fse.copy(extractedPath, targetDir);

  // Find the main 3D model file(s)
  const modelFiles = detectedFiles.filter(f => f.type === '3d-model');
  const mainModelFile = modelFiles[0]; // Use first model file as primary

  if (!mainModelFile) {
    throw new Error('No 3D model files found in ZIP archive');
  }

  // Public URL for the main 3D model entry point
  const baseUrl = getPublicBaseUrl(req);
  const entryPointUrl =
    `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}` +
    `/3d-model/${encodeURIComponent(assetId)}/${encodeURIComponent(mainModelFile.name)}`;

  // Compute total size of all detected files (best-effort).
  // NOTE: detectedFiles paths point to extractedPath; if some are missing, ignore.
  let totalSize = 0;
  for (const f of detectedFiles) {
    try {
      const stats = await fsp.stat(f.path);
      totalSize += stats.size;
    } catch {
      // ignore
    }
  }

  const fallbackName = path.parse(mainModelFile.name).name || mainModelFile.name;
  const { label, title } = getLabelAndTitle(req, fallbackName);

  console.log(`✅ [UnifiedUpload] 3D ZIP archive processed: ${entryPointUrl}`);

  return res.status(201).json({
    success: true,
    value: {
      type: '3d-model',
      projectId,
      id: assetId,
      label,
      title,
      entryPointUrl,
      entryPoint: mainModelFile.name,
      mimeType: 'application/octet-stream',
      fileSize: totalSize,
      metadata: {
        format: inferFormatFromFilename(mainModelFile.name)
      }
    }
  });
}

/**
 * Handle RTI upload (ZIP with info.json).
 * The "entry point" is always the extracted info.json.
 */
async function handleRTIUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  originalFile: Express.Multer.File,
  res: Response,
  _cleanupPaths: string[]
): Promise<Response> {
  // Final destination directory for this RTI asset
  const targetDir = projectRtiAssetDir(projectId, assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  // Copy all extracted files to target directory
  await fse.copy(extractedPath, targetDir);

  // Validate presence of info.json
  const infoPath = path.join(targetDir, 'info.json');
  try {
    await fsp.access(infoPath);
  } catch {
    throw new Error('Invalid RTI asset: info.json not found in archive.');
  }

  // Parse info.json for metadata
  let info: any;
  try {
    const raw = await fsp.readFile(infoPath, 'utf-8');
    info = JSON.parse(raw);
  } catch {
    throw new Error('Invalid RTI asset: info.json is not valid JSON.');
  }

  // Extract RTI metadata (best-effort)
  const rtiFormat =
    (typeof info.type === 'string' ? info.type : '')?.toLowerCase() ||
    (typeof info.rtiFormat === 'string' ? info.rtiFormat : '')?.toLowerCase() ||
    undefined;

  // Entry point URL for info.json
  const baseUrl = getPublicBaseUrl(req);
  const entryPointUrl =
    `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}` +
    `/rti/${encodeURIComponent(assetId)}/info.json`;

  // Entry point size (info.json), not zip size
  const infoStats = await fsp.stat(infoPath);

  // Fallback name for label/title derived from zip filename
  const fallbackName = path.parse(originalFile.originalname).name || originalFile.originalname;
  const { label, title } = getLabelAndTitle(req, fallbackName);

  console.log(`✅ [UnifiedUpload] RTI asset uploaded: ${entryPointUrl}`);
  console.log(`   📊 Entry size: ${(infoStats.size / 1024).toFixed(1)} KB, rtiFormat: ${rtiFormat ?? 'unknown'}`);

  return res.status(201).json({
    success: true,
    value: {
      type: 'rti',
      projectId,
      id: assetId,
      label,
      title,
      entryPointUrl,
      entryPoint: 'info.json',
      mimeType: 'application/json',
      fileSize: infoStats.size,
      metadata: {
        rtiFormat,
        zipName: originalFile.originalname
      }
    }
  });
}
