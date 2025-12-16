// src/middleware/rti-upload.middleware.ts

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Request } from 'express';
import { ensureProjectSkeleton, projectTmpDir } from '../utils/project-static-paths.js';

/**
 * Multer storage configuration for RTI ZIP uploads.
 *
 * Files are stored in a per-project temporary directory:
 *   project_files/<projectId>/tmp
 *
 * The controller will later:
 * - validate the ZIP contents
 * - extract it into: project_files/<projectId>/rti/<assetId>/
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

    // Keep .zip extension if present, otherwise force it to .zip
    const safeExt = ext ? ext.toLowerCase() : '.zip';

    cb(null, `${safeBase}_${unique}${safeExt}`);
  }
});

/**
 * File filter (lightweight check):
 * Accept only files that look like ZIP based on extension and MIME type.
 *
 * IMPORTANT:
 * This is NOT a cryptographic/strong validation.
 * The controller must verify the uploaded file is really a ZIP by checking
 * its signature (magic bytes) before extracting it.
 */
const fileFilter = function (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  const isZipByExt = ext === '.zip';
  const isZipByMime =
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime === 'application/octet-stream'; // some clients send generic octet-stream

  if (!isZipByExt && !isZipByMime) {
    return cb(new Error('Only ZIP files are allowed for RTI assets.'), false);
  }

  cb(null, true);
};

/**
 * Multer middleware for a single uploaded file in field name "file".
 */
export const rtiUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    // Adjust if needed. Keep generous for RTI datasets.
    fileSize: 1024 * 1024 * 1024 // 1 GiB  //FIXME
  }
}).single('file');
