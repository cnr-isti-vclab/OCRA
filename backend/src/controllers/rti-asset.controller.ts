// src/controllers/rti-asset.controller.ts

import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import extract from 'extract-zip';

/**
 * Ensures that the generated slug is unique within the project directory.
 * If a folder with the base slug already exists, the function appends an
 * incremental numeric suffix (e.g., "slug-1", "slug-2", ...) until an
 * available directory name is found.
 *
 * @param root - Root path where all RTI assets are stored.
 * @param projectId - ID of the project the asset belongs to.
 * @param baseSlug - The initial slug derived from the uploaded file name.
 * @returns A unique slug that does not collide with existing asset folders.
 */
function makeUniqueSlug(
  root: string,
  projectId: string,
  baseSlug: string,

): string {
  let slug = baseSlug;
  let counter = 1;

  while (fs.existsSync(path.join(root, projectId, slug))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}


/**
 * Controller: uploadRtiAssetHandler
 *
 * POST /api/projects/:projectId/hdt/assets/rti/upload
 *
 * Responsibilities:
 * - Handles the uploaded RTI ZIP file (provided by rtiUploadMiddleware)
 * - Extracts the ZIP into a per-project / per-asset directory
 * - Validates the presence of info.json
 * - Parses info.json and extracts minimal metadata
 * - Returns a public URL for info.json and a metadata summary
 *
 * Note:
 * This does NOT add the asset to the HDT metadata document.
 * The frontend must call POST /:projectId/hdt/assets afterwards.
 */
export async function uploadRtiAssetHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    // Uploaded ZIP file (via rtiUploadMiddleware)
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const zipPath = file.path;
    const originalName = file.originalname;

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);

    // Base folder for all RTI assets
    const rtiAssetsRoot =
      process.env.RTI_ASSETS_PATH || path.join(process.cwd(), 'rti_assets');

    // Safe unique slug used as the final asset folder name
    const baseSlug = baseName.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
    const assetSlug = makeUniqueSlug(rtiAssetsRoot, projectId, baseSlug);

    // Final destination directory for this asset
    const targetDir = path.join(rtiAssetsRoot, projectId, assetSlug);

    await fsp.mkdir(targetDir, { recursive: true });

    // Extract ZIP content
    await extract(zipPath, { dir: targetDir });

    // Cleanup temporary ZIP file
    try {
      await fsp.unlink(zipPath);
    } catch (cleanupErr) {
      console.warn('Failed to remove temporary RTI ZIP:', cleanupErr);
    }

    // Check for info.json
    const infoPath = path.join(targetDir, 'info.json');
    try {
      await fsp.access(infoPath);
    } catch {
      return res.status(400).json({
        error: 'Invalid RTI asset: info.json not found in archive.'
      });
    }

    // Parse info.json
    let info: any;
    try {
      const raw = await fsp.readFile(infoPath, 'utf-8');
      info = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to parse info.json:', err);
      return res.status(400).json({
        error: 'Invalid RTI asset: info.json is not valid JSON.'
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
    const colorspace =
      typeof info.colorspace === 'string' ? info.colorspace : null;

    // Public URL served via Express static handler
    const infoJsonUrl = `/assets/rti/${encodeURIComponent(
      projectId
    )}/${encodeURIComponent(assetSlug)}/info.json`;

    return res.status(201).json({
      success: true,
      projectId,
      assetSlug,
      storageDir: targetDir,
      infoJsonPath: infoPath,
      infoJsonUrl,
      infoSummary: {
        rtiType,
        width,
        height,
        nplanes,
        format,
        colorspace
      }
    });
  } catch (error: any) {
    console.error('Error while uploading RTI asset:', error);
    return res.status(500).json({
      error: 'Failed to upload RTI asset.',
      message: error?.message ?? String(error)
    });
  }
}
