// src/middleware/unified-asset-upload.middleware.ts

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import extract from 'extract-zip';
import type { Request } from 'express';
import { ensureProjectSkeleton, projectTmpDir } from '../utils/project-static-paths.js';

/**
 * Extended Request interface to include asset processing results
 */
export interface AssetProcessingRequest extends Request {
  assetProcessing: {
    type: 'rti' | '3d' | '3d-direct';
    extractedPath?: string; // For ZIP files, path where content was extracted
    originalFile: Express.Multer.File;
    detectedFiles?: Array<{
      name: string;
      path: string;
      type: '3d-model' | 'rti-info' | 'texture' | 'other';
    }>;
  };
}

/**
 * Supported 3D model file extensions
 */
const SUPPORTED_3D_EXTENSIONS = [
  '.ply', '.obj', '.gltf', '.glb', '.fbx', '.dae', '.x3d', 
  '.stl', '.3ds', '.blend', '.ase', '.ifc'
];

/**
 * Check if a file extension indicates a 3D model
 */
function is3DModelFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_3D_EXTENSIONS.includes(ext);
}

/**
 * Check if a file is likely a texture/material file
 */
function isTextureFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const textureExts = ['.jpg', '.jpeg', '.png', '.bmp', '.tga', '.tiff', '.exr', '.hdr'];
  return textureExts.includes(ext);
}

/**
 * Analyze extracted ZIP contents to determine type
 */
async function analyzeZipContents(extractedPath: string): Promise<{
  type: 'rti' | '3d';
  files: Array<{ name: string; path: string; type: '3d-model' | 'rti-info' | 'texture' | 'other' }>;
}> {
  const files: Array<{ name: string; path: string; type: '3d-model' | 'rti-info' | 'texture' | 'other' }> = [];
  
  // Recursively scan extracted directory
  async function scanDirectory(dirPath: string, relativePath: string = '') {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursive scan for subdirectories
        await scanDirectory(fullPath, relativeFilePath);
      } else if (entry.isFile()) {
        let fileType: '3d-model' | 'rti-info' | 'texture' | 'other' = 'other';
        
        if (entry.name === 'info.json') {
          fileType = 'rti-info';
        } else if (is3DModelFile(entry.name)) {
          fileType = '3d-model';
        } else if (isTextureFile(entry.name)) {
          fileType = 'texture';
        }
        
        files.push({
          name: relativeFilePath,
          path: fullPath,
          type: fileType
        });
      }
    }
  }
  
  await scanDirectory(extractedPath);
  
  // Determine type based on detected files
  const hasRtiInfo = files.some(f => f.type === 'rti-info');
  const has3DModels = files.some(f => f.type === '3d-model');
  
  if (hasRtiInfo) {
    return { type: 'rti', files };
  } else if (has3DModels) {
    return { type: '3d', files };
  } else {
    throw new Error('ZIP archive contains neither RTI data (info.json) nor 3D models');
  }
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

    // Ensure project skeleton exists (model3d/, rti/, tmp/)
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
    fileSize: 1024 * 1024 * 1024 // 1 GB
  }
});

/**
 * Unified asset upload middleware
 * 
 * Processes both direct 3D model uploads and ZIP archives containing RTI or 3D content
 */
export const unifiedAssetUploadMiddleware = [
  upload.single('file'),
  async (req: Request, _res: any, next: any) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return next(new Error('No file uploaded'));
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const assetReq = req as AssetProcessingRequest;

      // Direct 3D model upload
      if (is3DModelFile(file.originalname)) {
        assetReq.assetProcessing = {
          type: '3d-direct',
          originalFile: file
        };
        return next();
      }

      // ZIP file - extract and analyze
      if (ext === '.zip') {
        const { projectId } = req.params;
        const extractedPath = path.join(path.dirname(file.path), `extracted_${Date.now()}`);
        
        try {
          // Extract ZIP
          await extract(file.path, { dir: extractedPath });
          
          // Analyze contents
          const analysis = await analyzeZipContents(extractedPath);
          
          assetReq.assetProcessing = {
            type: analysis.type,
            extractedPath,
            originalFile: file,
            detectedFiles: analysis.files
          };
          
          console.log(`📦 [UnifiedUpload] ZIP analysis for project ${projectId}:`, {
            type: analysis.type,
            fileCount: analysis.files.length,
            extractedTo: extractedPath
          });
          
        } catch (extractError: any) {
          // Cleanup on error
          try {
            await fsp.rm(extractedPath, { recursive: true, force: true });
          } catch {}
          
          throw new Error(`Failed to process ZIP archive: ${extractError.message}`);
        }
        
        return next();
      }

      // Should not reach here due to fileFilter, but just in case
      return next(new Error('Unsupported file format'));

    } catch (error: any) {
      console.error('[UnifiedAssetUpload] Processing error:', error);
      next(error);
    }
  }
];