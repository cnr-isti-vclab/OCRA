// src/controllers/unified-asset-upload.controller.ts

import express from 'express';
import type { Response } from 'express';
import type { AssetProcessingRequest } from '../middleware/unified-asset-upload-middleware.js'
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import fse from 'fs-extra';
import {
  ensureProjectSkeleton,
  projectModel3dAssetDir,
  projectRtiAssetDir
} from '../utils/project-static-paths.js';
import { updateDigitalAsset } from '../services/hdt-metadata.service.js';

/**
 * Get the base URL for public assets based on request
 * Handles Docker/nginx reverse proxy correctly
 */
function getPublicBaseUrl(req: any): string {
  // Check if we're behind a reverse proxy (Docker/nginx)
  const forwardedHost = req.get('X-Forwarded-Host');
  const forwardedProto = req.get('X-Forwarded-Proto') || 'http';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Fallback: use request host header
  const protocol = req.secure ? 'https' : 'http';
  const host = req.get('Host') || 'localhost:3002';

  return `${protocol}://${host}`;
}

/**
 * Unified asset upload controller
 * 
 * Handles uploads processed by unifiedAssetUploadMiddleware:
 * - Direct 3D model files
 * - ZIP archives containing RTI data
 * - ZIP archives containing 3D models
 */
export async function unifiedAssetUploadHandler(req: express.Request, res: express.Response) {
  // Type assertion - sappiamo che il middleware ha aggiunto assetProcessing
  const assetReq = req as AssetProcessingRequest;
  let cleanupPaths: string[] = [];

  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    // Get assetId from request body
    const assetIdRaw = req.body?.assetId;
    const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required.' });
    }

    const { assetProcessing } = assetReq;
    const { type, originalFile, extractedPath, detectedFiles } = assetProcessing;

    console.log(`🚀 [UnifiedUpload] Processing ${type} upload for project ${projectId}, asset ${assetId}`);

    // Ensure project directory skeleton exists
    ensureProjectSkeleton(projectId);

    // Add original file to cleanup list
    cleanupPaths.push(originalFile.path);
    if (extractedPath) {
      cleanupPaths.push(extractedPath);
    }

    // Process based on detected type

    switch (type) {
      case '3d-direct':
        return await handle3DDirectUpload(req, projectId, assetId, originalFile, res, cleanupPaths);

      case '3d':
        return await handle3DFromZipUpload(req, projectId, assetId, extractedPath!, detectedFiles!, res, cleanupPaths);

      case 'rti':
        return await handleRTIUpload(req, projectId, assetId, extractedPath!, originalFile, res, cleanupPaths);
    }

  } catch (error: any) {
    console.error('[UnifiedUpload] Error processing upload:', error);

    // Cleanup on error
    await cleanupFiles(cleanupPaths);

    return res.status(500).json({
      error: 'Failed to process upload.',
      message: error?.message ?? String(error),
    });
  }
}

/**
 * Handle direct 3D model upload (non-ZIP)
 */
async function handle3DDirectUpload(
  req: any,
  projectId: string,
  assetId: string,
  file: Express.Multer.File,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  try {
    // Final destination directory for this 3D asset
    const targetDir = projectModel3dAssetDir(projectId, assetId);
    await fsp.mkdir(targetDir, { recursive: true });

    // Move file to final location
    const targetPath = path.join(targetDir, file.originalname);
    await fsp.rename(file.path, targetPath);

    // Remove from cleanup list since it's been moved
    const fileIndex = cleanupPaths.indexOf(file.path);
    if (fileIndex > -1) {
      cleanupPaths.splice(fileIndex, 1);
    }

    // Get file stats
    const stats = await fsp.stat(targetPath);

    // Public URL for the 3D model file
    // Public URL for the 3D model file (absolute URL)
    const baseUrl = getPublicBaseUrl(req);
    const fileUrl = `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}/model3d/${encodeURIComponent(assetId)}/${encodeURIComponent(file.originalname)}`;
    console.log(`✅ [UnifiedUpload] Direct 3D model uploaded: ${fileUrl}`);

    return res.status(201).json({
      success: true,
      value: {
        // HDT format compatibility
        projectId,
        assetId,
        type: '3d-model',
        fileName: file.originalname,
        fileUrl,
        filePath: `${assetId}/${file.originalname}`,
        fileSize: stats.size,
        mimeType: file.mimetype,
        storageDir: targetDir,
      }
    });

  } catch (error: any) {
    throw new Error(`Failed to process 3D model upload: ${error.message}`);
  }
}

/**
 * Handle 3D models extracted from ZIP
 */
async function handle3DFromZipUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  detectedFiles: Array<{ name: string; path: string; type: string }>,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  try {
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

    // Public URL for the main 3D model file  
    // Public URL for the main 3D model file (absolute URL)
    const baseUrl = getPublicBaseUrl(req);
    const fileUrl = `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}/model3d/${encodeURIComponent(assetId)}/${encodeURIComponent(mainModelFile.name)}`;
    // Get total size of all files
    let totalSize = 0;
    for (const file of detectedFiles) {
      try {
        const stats = await fsp.stat(file.path);
        totalSize += stats.size;
      } catch {
        // Ignore if file stat fails
      }
    }

    console.log(`✅ [UnifiedUpload] 3D ZIP archive processed: ${fileUrl}`);

    return res.status(201).json({
      success: true,
      value: {
        // HDT format compatibility
        projectId,
        assetId,
        type: '3d-model-archive',
        fileName: mainModelFile.name,
        fileUrl,
        filePath: `${assetId}/${mainModelFile.name}`,
        fileSize: totalSize,
        storageDir: targetDir,
        additionalFiles: detectedFiles.map(f => ({
          name: f.name,
          type: f.type,
          url: `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}/model3d/${encodeURIComponent(assetId)}/${encodeURIComponent(f.name)}`
        }))
      }
    });

  } catch (error: any) {
    throw new Error(`Failed to process 3D archive upload: ${error.message}`);
  }
}

/**
 * Handle RTI upload (ZIP with info.json)
 */
async function handleRTIUpload(
  req: any,
  projectId: string,
  assetId: string,
  extractedPath: string,
  originalFile: Express.Multer.File,
  res: Response,
  cleanupPaths: string[]
): Promise<Response> {
  try {
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
    } catch (err) {
      throw new Error('Invalid RTI asset: info.json is not valid JSON.');
    }

    // Extract RTI metadata
    const rtiType = info.type?.toLowerCase() || info.rtiFormat?.toLowerCase() || null;
    const width = typeof info.width === 'number' ? info.width : null;
    const height = typeof info.height === 'number' ? info.height : null;
    const nplanes = typeof info.nplanes === 'number' ? info.nplanes :
      typeof info.nPlanes === 'number' ? info.nPlanes : null;
    const format = info.format || null;
    const colorspace = info.colorspace || null;

    // Public URL for info.json
    const baseUrl = getPublicBaseUrl(req);
    const infoJsonUrl = `${baseUrl}/assets/projects/${encodeURIComponent(projectId)}/rti/${encodeURIComponent(assetId)}/info.json`;

    const assetSizeBytes = originalFile.size || 0;
    console.log(`✅ [UnifiedUpload] RTI asset uploaded: ${infoJsonUrl}`);
    console.log(`   📊 Size: ${(assetSizeBytes / (1024 * 1024)).toFixed(2)} MB, Type: ${rtiType}`);

    // ✅ AGGIUNTO: Update HDT asset with RTI details
    try {
      console.log(`🔄 [UnifiedUpload] Updating HDT asset ${assetId} with RTI details...`);

      const assetUpdates = {
        fileName: originalFile.originalname,
        fileSize: assetSizeBytes,
        uploadResponse: {
          success: true,
          type: 'rti',
          projectId,
          assetId,
          fileName: originalFile.originalname,
          fileUrl: infoJsonUrl,
          filePath: `${assetId}/info.json`,
          fileSize: assetSizeBytes,
          mimeType: originalFile.mimetype || 'application/zip',
          storageDir: targetDir,
          infoJsonUrl,
          infoSummary: {
            rtiType,
            width,
            height,
            nplanes,
            format,
            colorspace,
            totalSize: assetSizeBytes,
          },
        },
        fileUrl: infoJsonUrl,
        filePath: `${assetId}/info.json`,
        mimeType: originalFile.mimetype || 'application/zip',
        additionalFiles: null
      };

      // Get user from request for HDT update
      const userSub = (req as any).user?.sub || (req as any).sessionUser?.sub || 'system';

      await updateDigitalAsset(projectId, assetId, assetUpdates, userSub);
      console.log(`✅ [UnifiedUpload] HDT asset ${assetId} updated with RTI details`);

    } catch (hdtError: any) {
      console.error(`⚠️ [UnifiedUpload] Failed to update HDT asset ${assetId}:`, hdtError.message);
      // Don't throw - file upload was successful, HDT update is secondary
    }

    return res.status(201).json({
      success: true,
      value: {
        type: 'rti',
        projectId,
        assetId,
        fileName: originalFile.originalname,
        fileUrl: infoJsonUrl,
        filePath: `${assetId}/info.json`,
        fileSize: assetSizeBytes,
        mimeType: originalFile.mimetype || 'application/zip',
        storageDir: targetDir,
        // RTI-specific fields
        infoJsonPath: infoPath,
        infoJsonUrl,
        infoSummary: {
          rtiType,
          width,
          height,
          nplanes,
          format,
          colorspace,
          totalSize: assetSizeBytes,
        }
      }
    });

  } catch (error: any) {
    throw new Error(`Failed to process RTI upload: ${error.message}`);
  }
}

/**
 * Cleanup temporary files
 */
async function cleanupFiles(paths: string[]): Promise<void> {
  await Promise.allSettled(
    paths.map(async (filePath) => {
      try {
        await fse.remove(filePath);
      } catch (err) {
        console.warn(`Failed to cleanup file: ${filePath}`, err);
      }
    })
  );
}