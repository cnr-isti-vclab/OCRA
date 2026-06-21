// src/middleware/unified-asset-upload.middleware.ts

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import type { Request } from 'express';
import { ensureProjectSkeleton, projectTmpDir } from '../utils/project-static-paths.js';
import {
  is3DModelFile,
  prepareAssetProcessingFromLocalFile,
  type PreparedAssetFile,
  type PreparedAssetProcessing,
  SUPPORTED_3D_EXTENSIONS,
} from '../services/asset-ingestion.service.js';

/**
 * Extended Request interface to include asset processing results
 */
export interface AssetProcessingRequest extends Request {
  assetProcessing: PreparedAssetProcessing;
}

/**
 * Multer storage configuration for unified asset uploads
 */
const storage = multer.diskStorage({
  destination: function (
    req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    const { projectId } = req.params as { projectId?: string };

    if (!projectId) {
      return cb(new Error('Missing projectId in route parameters'), '');
    }

    // Ensure project skeleton exists (3d-model/, rti/, tmp/)
    ensureProjectSkeleton(projectId);

    const tmpDir = projectTmpDir(projectId);
    fs.mkdirSync(tmpDir, { recursive: true });

    cb(null, tmpDir);
  },

  filename: function (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);

    // Normalize base name (lowercase, safe chars only)
    const safeBase = base.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();

    // Add timestamp + random component to avoid collisions
    const unique = `${Date.now()}_${Math.round(Math.random() * 1e4)}`;

    cb(null, `${safeBase}_${unique}${ext}`);
  }
});

/**
 * File filter: Accept ZIP files and 3D model files
 */
const fileFilter = function (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // Check for ZIP files
  const isZipByExt = ext === '.zip';
  const isZipByMime = [
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ].includes(mime);

  // Check for 3D model files
  const is3DModel = is3DModelFile(file.originalname);

  if (!isZipByExt && !isZipByMime && !is3DModel) {
    return cb(
      new Error(
        `Unsupported file type. Accepted: ZIP archives or 3D models (${SUPPORTED_3D_EXTENSIONS.join(', ')})`
      ), 
      false
    );
  }

  cb(null, true);
};

/**
 * Base multer configuration
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES ?? String(1024 * 1024 * 1024), 10),
  },
});

/**
 * Unified asset upload middleware
 * 
 * Processes both direct 3D model uploads and ZIP archives containing RTI or 3D content
 */
export const unifiedAssetUploadMiddleware = [
  upload.single('file'),
  async (req: Request, _res: any, next: any) => {
    const file = (req as any).file as Express.Multer.File | undefined;

    try {
      if (!file) {
        return next(new Error('No file uploaded'));
      }

      const assetReq = req as AssetProcessingRequest;
      const preparedFile: PreparedAssetFile = {
        path: file.path,
        originalname: file.originalname,
        mimetype: file.mimetype,
      };

      assetReq.assetProcessing = await prepareAssetProcessingFromLocalFile({ file: preparedFile });
      return next();

    } catch (error: any) {
      console.error('[UnifiedAssetUpload] Processing error:', error);
      if (file?.path) {
        try {
          await fsp.rm(file.path, { force: true });
        } catch {}
      }
      next(error);
    }
  }
];
