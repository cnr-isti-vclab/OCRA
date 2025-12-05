// src/middleware/rti-upload.middleware.ts

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Request } from 'express';

/**
 * Temporary directory for uploaded RTI ZIP archives.
 * Files are moved from here to their final destination after validation.
 */
export const rtiUploadTempDir =
  process.env.RTI_UPLOAD_TMP_PATH || path.join(process.cwd(), 'rti_uploads_tmp');

// Ensure the temp directory exists
fs.mkdirSync(rtiUploadTempDir, { recursive: true });

/**
 * Multer storage configuration:
 * - saves the uploaded ZIP inside the temporary directory
 * - generates a safe and unique filename
 */
const storage = multer.diskStorage({
  destination: function (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    cb(null, rtiUploadTempDir);
  },

  filename: function (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);

    // Normalize the base name (lowercase, safe chars only)
    const safeBase = base.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();

    // Add timestamp and random component to avoid collisions
    const unique = `${Date.now()}_${Math.round(Math.random() * 1e4)}`;

    cb(null, `${safeBase}_${unique}${ext}`);
  }
});

/**
 * File filter:
 * Accept only ZIP files. Reject everything else.
 */
const fileFilter = function (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void
) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  const isZip =
    ext === '.zip' ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime === 'application/octet-stream'; // fallback used by some browsers

  if (!isZip) {
    return cb(new Error('Only ZIP files are allowed for RTI assets.'), false);
  }

  cb(null, true);
};

/**
 * Final Multer middleware:
 * Accepts a single file with field name "file".
 */
export const rtiUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024 // (optional) max 1GB per ZIP
  }
}).single('file');
