import path from 'path';
import fsp from 'fs/promises';
import {
  collectObjPackagingWarnings,
  selectPrimary3DModelFile,
  type DetectedArchiveFile,
} from './model-archive-utils.js';
import { extractZipArchive, listZipEntries } from './zip-extraction.service.js';
import {
  isSupportedOpenLimeRasterImage,
  OPENLIME_RASTER_IMAGE_EXTENSIONS,
} from 'shared/openlime-layout';

export interface PreparedAssetFile {
  path: string;
  originalname: string;
  mimetype: string;
}

export interface PreparedAssetProcessing {
  type: 'rti' | '3d' | '3d-direct' | 'image-direct';
  extractedPath?: string;
  originalFile: PreparedAssetFile;
  detectedFiles?: DetectedArchiveFile[];
  primaryModelFile?: DetectedArchiveFile;
  rtiDatasetRootRelativePath?: string;
  warnings?: string[];
}

/**
 * Supported 3D model file extensions.
 */
export const SUPPORTED_3D_EXTENSIONS = [
  '.ply', '.obj', '.gltf', '.glb', '.fbx', '.dae', '.x3d',
  '.stl', '.3ds', '.blend', '.ase', '.ifc',
];

export const SUPPORTED_IMAGE_EXTENSIONS = [...OPENLIME_RASTER_IMAGE_EXTENSIONS];

/**
 * Check if a file extension indicates a 3D model.
 */
export function is3DModelFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_3D_EXTENSIONS.includes(ext);
}

function isSupported3dMimeType(mimetype: string | undefined): boolean {
  if (!mimetype) {
    return false;
  }

  const normalized = mimetype.split(';', 1)[0].trim().toLowerCase();
  return normalized === 'model/gltf-binary' || normalized === 'model/gltf+json';
}

/** Returns whether a filename or MIME type identifies a directly viewable raster image. */
export function isSupportedImageFile(filename: string, mimetype?: string): boolean {
  return isSupportedOpenLimeRasterImage(filename, mimetype);
}

async function detectFileKind(file: PreparedAssetFile): Promise<'3d-direct' | 'image-direct' | 'zip' | 'unknown'> {
  if (is3DModelFile(file.originalname) || isSupported3dMimeType(file.mimetype)) {
    return '3d-direct';
  }

  if (path.extname(file.originalname).toLowerCase() === '.zip') {
    return 'zip';
  }

  if (isSupportedImageFile(file.originalname, file.mimetype)) {
    return 'image-direct';
  }

  const handle = await fsp.open(file.path, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const slice = header.subarray(0, bytesRead);

    if (slice.length >= 4 && slice.subarray(0, 4).equals(Buffer.from('glTF'))) {
      return '3d-direct';
    }

    if (
      slice.length >= 4 &&
      slice[0] === 0x50 &&
      slice[1] === 0x4b &&
      (slice[2] === 0x03 || slice[2] === 0x05 || slice[2] === 0x07) &&
      (slice[3] === 0x04 || slice[3] === 0x06 || slice[3] === 0x08)
    ) {
      return 'zip';
    }

    return 'unknown';
  } finally {
    await handle.close();
  }
}

function isTextureFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const textureExts = ['.jpg', '.jpeg', '.png', '.bmp', '.tga', '.tiff', '.exr', '.hdr'];
  return textureExts.includes(ext);
}

export const RTI_DATASET_INFO_FILE = 'info.json';

function isRootFileEntry(entryName: string, expectedFileName: string): boolean {
  return entryName.replace(/\\/g, '/') === expectedFileName;
}

function normalizeArchiveEntry(entryName: string): string {
  return entryName
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function isArchiveDirectoryPlaceholder(entryName: string): boolean {
  return entryName.replace(/\\/g, '/').trim().endsWith('/');
}

function isIgnoredArchiveEntry(entryName: string): boolean {
  return (
    entryName === '' ||
    entryName === '.' ||
    entryName === '..' ||
    entryName === '.DS_Store' ||
    entryName.startsWith('__MACOSX/')
  );
}

export function resolveRtiDatasetRootRelativePath(entryNames: string[]): string | null {
  const normalizedEntries = entryNames
    .filter((entry) => !isArchiveDirectoryPlaceholder(entry))
    .map(normalizeArchiveEntry)
    .filter((entry) => !isIgnoredArchiveEntry(entry));

  if (normalizedEntries.some((entry) => isRootFileEntry(entry, RTI_DATASET_INFO_FILE))) {
    return '';
  }

  const topLevelDirectories = new Set<string>();

  for (const entry of normalizedEntries) {
    const slashIndex = entry.indexOf('/');
    if (slashIndex === -1) {
      return null;
    }
    topLevelDirectories.add(entry.slice(0, slashIndex));
  }

  if (topLevelDirectories.size !== 1) {
    return null;
  }

  const [topLevelDirectory] = Array.from(topLevelDirectories);
  return normalizedEntries.includes(`${topLevelDirectory}/${RTI_DATASET_INFO_FILE}`)
    ? topLevelDirectory
    : null;
}

export async function isRtiZipPackage(zipPath: string): Promise<boolean> {
  const entries = await listZipEntries(zipPath);
  return resolveRtiDatasetRootRelativePath(entries) !== null;
}

/**
 * Analyze extracted ZIP contents to determine whether they contain RTI or 3D assets.
 */
export async function analyzeZipContents(extractedPath: string): Promise<{
  type: 'rti' | '3d';
  files: DetectedArchiveFile[];
  rtiDatasetRootRelativePath: string | null;
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

      if (entry.name === RTI_DATASET_INFO_FILE) {
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

  const rtiDatasetRootRelativePath = resolveRtiDatasetRootRelativePath(files.map((file) => file.name));
  const has3DModels = files.some((file) => file.type === '3d-model');

  if (rtiDatasetRootRelativePath !== null) {
    return { type: 'rti', files, rtiDatasetRootRelativePath };
  }

  if (has3DModels) {
    return { type: '3d', files, rtiDatasetRootRelativePath: null };
  }

  throw new Error(`ZIP archive contains neither RTI package entry point (${RTI_DATASET_INFO_FILE}) nor 3D models`);
}

/**
 * Prepare a local file for the unified asset ingestion pipeline.
 */
export async function prepareAssetProcessingFromLocalFile(input: {
  file: PreparedAssetFile;
  extractionRootDir?: string;
}): Promise<PreparedAssetProcessing> {
  const { file } = input;
  const detectedKind = await detectFileKind(file);

  if (detectedKind === '3d-direct') {
    return {
      type: '3d-direct',
      originalFile: file,
    };
  }

  if (detectedKind === 'image-direct') {
    return {
      type: 'image-direct',
      originalFile: file,
    };
  }

  if (detectedKind !== 'zip') {
    throw new Error(
      `Unsupported file type. Accepted: ZIP archives, images (${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}), or 3D models (${SUPPORTED_3D_EXTENSIONS.join(', ')})`,
    );
  }

  const extractedPath = path.join(
    input.extractionRootDir ?? path.dirname(file.path),
    `extracted_${Date.now()}`,
  );

  try {
    const isRtiPackage = await isRtiZipPackage(file.path);
    await extractZipArchive(file.path, extractedPath);

    const analysis = await analyzeZipContents(extractedPath);
    const warnings: string[] = [];
    let primaryModelFile: DetectedArchiveFile | undefined;

    if (isRtiPackage && analysis.type !== 'rti') {
      throw new Error(`RTI ZIP archive is missing required ${RTI_DATASET_INFO_FILE} at dataset root after extraction`);
    }

    if (!isRtiPackage && analysis.type === 'rti') {
      throw new Error(`RTI ZIP archive must declare ${RTI_DATASET_INFO_FILE} at the archive root`);
    }

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
      rtiDatasetRootRelativePath: analysis.rtiDatasetRootRelativePath ?? undefined,
      warnings,
    };
  } catch (error) {
    await fsp.rm(extractedPath, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
