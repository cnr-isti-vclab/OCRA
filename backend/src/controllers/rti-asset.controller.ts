// src/controllers/rti-asset.controller.ts

import { ensureProjectSkeleton, projectRtiAssetDir } from '../utils/project-static-paths.js';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import fsp from 'fs/promises';
import { extractZipArchive } from '../services/zip-extraction.service.js';
import { analyzeZipContents, RTI_DATASET_INFO_FILE } from '../services/asset-ingestion.service.js';

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fse.emptyDir(targetDir);
  const entries = await fsp.readdir(sourceDir);
  await Promise.all(
    entries.map((entry) => fse.copy(path.join(sourceDir, entry), path.join(targetDir, entry))),
  );
}


/**
 * Controller: uploadRtiAssetHandler
 *
 * POST /api/projects/:projectId/hdt/assets/rti/upload
 *
 * Responsibilities:
 * - Handles the uploaded RTI ZIP file (provided by rtiUploadMiddleware)
 * - Extracts the ZIP into: project_files/PROJECT_ID/rti/ASSET_ID/
 * - Validates the presence of `info.json`
 * - Parses `info.json` and extracts minimal metadata
 * - Returns a public URL for `info.json` and a metadata summary
 *
 * Note:
 * This does NOT add the asset to the HDT metadata document.
 * The frontend must call POST /:projectId/hdt/assets afterwards (or before,
 * depending on your workflow), but it MUST provide assetId to this endpoint.
 */
export async function uploadRtiAssetHandler(req: Request, res: Response) {
  let zipPathForCleanup: string | null = null;
  let extractedDirForCleanup: string | null = null;

  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    // The frontend must provide the unique asset id (assigned by /hdt)
    // in the multipart/form-data fields.
    const assetIdRaw = (req as any).body?.assetId;
    const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required.' });
    }

    // Uploaded ZIP file (via rtiUploadMiddleware)
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const zipPath = file.path;
    zipPathForCleanup = zipPath;

    // Ensure project directory skeleton exists:
    // project_files/PROJECT_ID/{3d-model,rti,tmp}
    ensureProjectSkeleton(projectId);

    const extractedDir = path.join(path.dirname(zipPath), `rti_extract_${Date.now()}`);
    extractedDirForCleanup = extractedDir;
    const targetDir = projectRtiAssetDir(projectId, assetId);
    await fsp.mkdir(targetDir, { recursive: true });

    // Extract ZIP content into a temporary directory, then normalize the dataset root
    await extractZipArchive(zipPath, extractedDir);
    const analysis = await analyzeZipContents(extractedDir);
    if (analysis.type !== 'rti') {
      return res.status(400).json({
        error: `Invalid RTI asset: ${RTI_DATASET_INFO_FILE} not found at archive root or within a single top-level directory.`,
      });
    }

    const datasetRootPath = analysis.rtiDatasetRootRelativePath
      ? path.join(extractedDir, analysis.rtiDatasetRootRelativePath)
      : extractedDir;

    await copyDirectoryContents(datasetRootPath, targetDir);

    // Cleanup ONLY the uploaded ZIP file.
    // Do NOT empty a shared tmp directory (race condition with concurrent uploads).
    const infoPath = path.join(targetDir, RTI_DATASET_INFO_FILE);
    try {
      await fsp.access(infoPath);
    } catch {
      return res.status(400).json({
        error: `Invalid RTI asset: ${RTI_DATASET_INFO_FILE} not found in archive root.`,
      });
    }

    // Optional: compute asset size in bytes.
    // Note: file.size is the ZIP size, not the extracted folder size.
    let assetSizeBytes = 0;
    if (typeof file.size === 'number') {
      assetSizeBytes = file.size;
    } else {
      try {
        const infoStat = await fsp.stat(infoPath);
        assetSizeBytes = infoStat.size;
      } catch (sizeErr) {
        console.warn('Could not compute RTI asset size', {
          projectId,
          assetId,
          infoPath,
          error: sizeErr,
        });
      }
    }

    console.log(
      `RTI asset ${assetId}: ${(assetSizeBytes / (1024 * 1024 * 1024)).toFixed(3)} GB (zip size)`
    );

    // Parse info.json
    let info: any;
    try {
      const raw = await fsp.readFile(infoPath, 'utf-8');
      info = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse info.json:', err);
      return res.status(400).json({
        error: 'Invalid RTI asset: info.json is not valid JSON.',
      });
    }

    // Minimal extracted metadata
    const rtiType =
      typeof info.type === 'string'
        ? info.type.toLowerCase()
        : typeof info.rtiFormat === 'string'
          ? info.rtiFormat.toLowerCase()
          : null;

    const width = typeof info.width === 'number' ? info.width : null;
    const height = typeof info.height === 'number' ? info.height : null;

    const nplanes =
      typeof info.nplanes === 'number'
        ? info.nplanes
        : typeof info.nPlanes === 'number'
          ? info.nPlanes
          : null;

    const format = typeof info.format === 'string' ? info.format : null;
    const colorspace = typeof info.colorspace === 'string' ? info.colorspace : null;

    // Public URL served via Express static handler.
    // With: app.use('/assets/projects', express.static(PROJECT_FILES_ROOT))
    // the file becomes:
    // /assets/projects/PROJECT_ID/rti/ASSET_ID/info.json
    const infoJsonUrl = `/assets/projects/${encodeURIComponent(projectId)}/rti/${encodeURIComponent(assetId)}/${RTI_DATASET_INFO_FILE}`;

    return res.status(201).json({
      success: true,
      projectId,
      assetId,
      storageDir: targetDir,
      infoJsonPath: infoPath,
      infoJsonUrl,
      infoSummary: {
        rtiType,
        width,
        height,
        nplanes,
        format,
        colorspace,
        totalSize: Number(assetSizeBytes),
      },
    });
  } catch (error: any) {
    console.error('Error while uploading RTI asset:', error);
    return res.status(500).json({
      error: 'Failed to upload RTI asset.',
      message: error?.message ?? String(error),
    });
  } finally {
    if (zipPathForCleanup) {
      await fse.remove(zipPathForCleanup).catch((cleanupErr) => {
        console.warn('Failed to remove temporary RTI ZIP:', cleanupErr);
      });
    }
    if (extractedDirForCleanup) {
      await fse.remove(extractedDirForCleanup).catch(() => undefined);
    }
  }
}
