import path from 'path';
import fsp from 'fs/promises';
import {
  collectObjPackagingWarnings,
  selectPrimary3DModelFile,
  type DetectedArchiveFile,
} from './model-archive-utils.js';
import { extractZipArchive } from './zip-extraction.service.js';

export interface PreparedAssetFile {
  path: string;
  originalname: string;
  mimetype: string;
}

export interface PreparedAssetProcessing {
  type: 'rti' | '3d' | '3d-direct';
  extractedPath?: string;
  originalFile: PreparedAssetFile;
  detectedFiles?: DetectedArchiveFile[];
  primaryModelFile?: DetectedArchiveFile;
  warnings?: string[];
}

/**
 * Supported 3D model file extensions.
 */
export const SUPPORTED_3D_EXTENSIONS = [
  '.ply', '.obj', '.gltf', '.glb', '.fbx', '.dae', '.x3d',
  '.stl', '.3ds', '.blend', '.ase', '.ifc',
];

/**
 * Check if a file extension indicates a 3D model.
 */
export function is3DModelFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_3D_EXTENSIONS.includes(ext);
}

function isTextureFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const textureExts = ['.jpg', '.jpeg', '.png', '.bmp', '.tga', '.tiff', '.exr', '.hdr'];
  return textureExts.includes(ext);
}

/**
 * Analyze extracted ZIP contents to determine whether they contain RTI or 3D assets.
 */
export async function analyzeZipContents(extractedPath: string): Promise<{
  type: 'rti' | '3d';
  files: DetectedArchiveFile[];
}> {
  const files: DetectedArchiveFile[] = [];

  async function scanDirectory(dirPath: string, relativePath = '') {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = path.posix.join(relativePath.replace(/\\/g, '/'), entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativeFilePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

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
        type: fileType,
      });
    }
  }

  await scanDirectory(extractedPath);

  const hasRtiInfo = files.some((file) => file.type === 'rti-info');
  const has3DModels = files.some((file) => file.type === '3d-model');

  if (hasRtiInfo) {
    return { type: 'rti', files };
  }

  if (has3DModels) {
    return { type: '3d', files };
  }

  throw new Error('ZIP archive contains neither RTI data (info.json) nor 3D models');
}

/**
 * Prepare a local file for the unified asset ingestion pipeline.
 */
export async function prepareAssetProcessingFromLocalFile(input: {
  file: PreparedAssetFile;
  extractionRootDir?: string;
}): Promise<PreparedAssetProcessing> {
  const { file } = input;
  const ext = path.extname(file.originalname).toLowerCase();

  if (is3DModelFile(file.originalname)) {
    return {
      type: '3d-direct',
      originalFile: file,
    };
  }

  if (ext !== '.zip') {
    throw new Error(
      `Unsupported file type. Accepted: ZIP archives or 3D models (${SUPPORTED_3D_EXTENSIONS.join(', ')})`,
    );
  }

  const extractedPath = path.join(
    input.extractionRootDir ?? path.dirname(file.path),
    `extracted_${Date.now()}`,
  );

  try {
    await extractZipArchive(file.path, extractedPath);

    const analysis = await analyzeZipContents(extractedPath);
    const warnings: string[] = [];
    let primaryModelFile: DetectedArchiveFile | undefined;

    if (analysis.type === '3d') {
      const selectedPrimary = selectPrimary3DModelFile(analysis.files);
      if (!selectedPrimary) {
        throw new Error('ZIP archive analysis failed: no 3D model entry point could be selected');
      }
      primaryModelFile = selectedPrimary;

      const objWarnings = await collectObjPackagingWarnings(analysis.files, primaryModelFile);
      warnings.push(...objWarnings);
    }

    return {
      type: analysis.type,
      extractedPath,
      originalFile: file,
      detectedFiles: analysis.files,
      primaryModelFile,
      warnings,
    };
  } catch (error) {
    await fsp.rm(extractedPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
