import path from 'path';
import fsp from 'fs/promises';
import fse from 'fs-extra';
import {
  ensureProjectSkeleton,
  projectImageAssetDir,
  projectModel3dAssetDir,
  projectRtiAssetDir,
} from '../utils/project-static-paths.js';
import {
  downloadRemoteAssetToProjectTemp,
  validateRemoteAssetSourceUrl,
  type RemoteAssetBasicAuth,
} from './remote-asset-import.service.js';
import {
  prepareAssetProcessingFromLocalFile,
  RTI_DATASET_INFO_FILE,
  type PreparedAssetFile,
  type PreparedAssetProcessing,
} from './asset-ingestion.service.js';
import { updateDigitalAsset } from './hdt-metadata.service.js';
import { selectPrimary3DModelFile } from './model-archive-utils.js';
import {
  inferOpenLimeLayoutFromUrl,
  openLimeRasterMimeTypeFromUrl,
} from 'shared/openlime-layout';
import type { DigitalAsset, OpenLimeLayout } from 'shared/types';

function encodePathPreservingSlashes(p: string): string {
  return p
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeRelativeAssetPath(rawPath: string): string {
  const normalizedSeparators = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(normalizedSeparators);

  if (!normalized || normalized === '.') {
    throw new Error('Invalid empty entry point path in archive');
  }
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Invalid entry point path "${rawPath}": path traversal is not allowed`);
  }
  if (path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid entry point path "${rawPath}": absolute paths are not allowed`);
  }

  return normalized;
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fse.emptyDir(targetDir);
  const entries = await fsp.readdir(sourceDir);
  await Promise.all(
    entries.map((entry) => fse.copy(path.join(sourceDir, entry), path.join(targetDir, entry))),
  );
}

async function getDirectorySizeBytes(dir: string): Promise<number> {
  let total = 0;

  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(full);
    } else if (entry.isFile()) {
      try {
        const stat = await fsp.stat(full);
        total += stat.size;
      } catch {
        // Keep ingestion resilient to rare stat failures.
      }
    }
  }

  return total;
}

async function cleanupPaths(paths: string[]): Promise<void> {
  for (const currentPath of paths) {
    try {
      await fse.remove(currentPath);
    } catch {
      // Best effort cleanup only.
    }
  }
}

interface RemoteAssetIngestionInput {
  projectId: string;
  assetId: string;
  sourceUrl: string;
  userId: string;
  publicBaseUrl: string;
  auth?: RemoteAssetBasicAuth | null;
  expectedAssetType: DigitalAsset['type'];
}

export class AssetTypeMismatchError extends Error {
  constructor(expectedType: string, importedType: string, assetId: string) {
    super(`Asset type mismatch: import is "${importedType}" but asset "${assetId}" is "${expectedType}".`);
    this.name = 'AssetTypeMismatchError';
  }
}

/** Ensures ingestion cannot silently replace an existing asset with another media type. */
export function assertCompatibleAssetType(
  expectedType: DigitalAsset['type'],
  importedType: RemoteAssetIngestionResult['type'],
  assetId: string,
): void {
  if (expectedType !== 'other' && expectedType !== importedType) {
    throw new AssetTypeMismatchError(expectedType, importedType, assetId);
  }
}

function preparedAssetType(type: PreparedAssetProcessing['type']): RemoteAssetIngestionResult['type'] {
  if (type === 'rti') return 'rti';
  if (type === 'image-direct') return 'image';
  return '3d-model';
}

export interface RemoteAssetIngestionResult {
  assetId: string;
  type: '3d-model' | 'rti' | 'image';
  entryPoint: string;
  entryPointUrl: string;
  entrySize?: number;
  storageDir?: string;
  fileName: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  warnings: string[];
  sourceUrl: string;
}

export async function ingestRemoteAssetIntoExistingAsset(
  input: RemoteAssetIngestionInput
): Promise<RemoteAssetIngestionResult> {
  const cleanupTargets: string[] = [];

  try {
    const validatedSourceUrl = (await validateRemoteAssetSourceUrl(input.sourceUrl)).toString();
    const remoteImageLayout = inferOpenLimeLayoutFromUrl(validatedSourceUrl);
    if (remoteImageLayout) {
      assertCompatibleAssetType(input.expectedAssetType, 'image', input.assetId);
      if (input.auth) {
        throw new Error('HTTP Basic Auth is not supported for remote OpenLIME image references because the browser loads their resources directly.');
      }
      return registerRemoteOpenLimeImageAsset(
        { ...input, sourceUrl: validatedSourceUrl },
        remoteImageLayout,
      );
    }

    ensureProjectSkeleton(input.projectId);

    const download = await downloadRemoteAssetToProjectTemp(input.projectId, input.sourceUrl, input.auth);
    cleanupTargets.push(download.file.path);

    const prepared = await prepareAssetProcessingFromLocalFile({ file: download.file });
    assertCompatibleAssetType(input.expectedAssetType, preparedAssetType(prepared.type), input.assetId);
    if (prepared.extractedPath) {
      cleanupTargets.push(prepared.extractedPath);
    }

    const result = await ingestPreparedAssetIntoExistingAsset({
      projectId: input.projectId,
      assetId: input.assetId,
      userId: input.userId,
      publicBaseUrl: input.publicBaseUrl,
      sourceUrl: download.finalUrl,
      assetProcessing: prepared,
      cleanupTargets,
    });

    await cleanupPaths(cleanupTargets);
    return result;
  } catch (error) {
    await cleanupPaths(cleanupTargets);
    throw error;
  }
}

async function registerRemoteOpenLimeImageAsset(
  input: RemoteAssetIngestionInput,
  layout: OpenLimeLayout,
): Promise<RemoteAssetIngestionResult> {
  const parsedUrl = new URL(input.sourceUrl);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Remote OpenLIME image URLs must use HTTP or HTTPS.');
  }

  const fileName = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'remote-image');
  const mimeType = openLimeRasterMimeTypeFromUrl(input.sourceUrl);
  const metadata = {
    openLimeLayout: layout,
    sourceUrl: input.sourceUrl,
  };
  const updatedDoc = await updateDigitalAsset(
    input.projectId,
    input.assetId,
    {
      type: 'image',
      entryPointUrl: input.sourceUrl,
      entryPoint: input.sourceUrl,
      ...(mimeType ? { mimeType } : {}),
      metadata,
    },
    input.userId,
  );

  if (!updatedDoc) {
    throw new Error(`Failed to persist remote image reference for asset "${input.assetId}"`);
  }

  return {
    assetId: input.assetId,
    type: 'image',
    entryPoint: input.sourceUrl,
    entryPointUrl: input.sourceUrl,
    fileName,
    ...(mimeType ? { mimeType } : {}),
    metadata,
    warnings: [],
    sourceUrl: input.sourceUrl,
  };
}

interface PreparedAssetIngestionInput {
  projectId: string;
  assetId: string;
  userId: string;
  publicBaseUrl: string;
  sourceUrl: string;
  assetProcessing: PreparedAssetProcessing;
  cleanupTargets: string[];
}

export async function ingestPreparedAssetIntoExistingAsset(
  input: PreparedAssetIngestionInput
): Promise<RemoteAssetIngestionResult> {
  const {
    projectId,
    assetId,
    userId,
    publicBaseUrl,
    sourceUrl,
    assetProcessing,
    cleanupTargets,
  } = input;

  const {
    type,
    originalFile,
    extractedPath,
    detectedFiles,
    primaryModelFile,
    warnings = [],
    rtiDatasetRootRelativePath,
  } = assetProcessing;

  if (originalFile.path && !cleanupTargets.includes(originalFile.path)) {
    cleanupTargets.push(originalFile.path);
  }
  if (extractedPath && !cleanupTargets.includes(extractedPath)) {
    cleanupTargets.push(extractedPath);
  }

  switch (type) {
    case 'image-direct':
      return ingestDirectAsset({
        projectId,
        assetId,
        file: originalFile,
        assetType: 'image',
        userId,
        publicBaseUrl,
        sourceUrl,
        cleanupTargets,
        warnings,
      });

    case '3d-direct':
      return ingestDirectAsset({
        projectId,
        assetId,
        file: originalFile,
        assetType: '3d-model',
        userId,
        publicBaseUrl,
        sourceUrl,
        cleanupTargets,
        warnings,
      });

    case '3d':
      if (!extractedPath || !detectedFiles) {
        throw new Error('Missing extracted 3D archive data');
      }
      return ingest3DArchiveAsset({
        projectId,
        assetId,
        extractedPath,
        detectedFiles,
        primaryModelFile,
        userId,
        publicBaseUrl,
        sourceUrl,
        warnings,
      });

    case 'rti':
      if (!extractedPath) {
        throw new Error('Missing extracted RTI archive data');
      }
      return ingestRtiArchiveAsset({
        projectId,
        assetId,
        extractedPath,
        rtiDatasetRootRelativePath,
        originalFile,
        userId,
        publicBaseUrl,
        sourceUrl,
      });

    default:
      throw new Error(`Unsupported prepared asset type: ${String(type)}`);
  }
}

async function ingestDirectAsset(input: {
  projectId: string;
  assetId: string;
  file: PreparedAssetFile;
  assetType: 'image' | '3d-model';
  userId: string;
  publicBaseUrl: string;
  sourceUrl: string;
  cleanupTargets: string[];
  warnings: string[];
}): Promise<RemoteAssetIngestionResult> {
  const targetDir = input.assetType === 'image'
    ? projectImageAssetDir(input.projectId, input.assetId)
    : projectModel3dAssetDir(input.projectId, input.assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  const safeFileName = path.posix.basename(input.file.originalname.replace(/\\/g, '/'));
  if (!safeFileName) {
    throw new Error('Invalid uploaded filename');
  }

  const targetPath = path.join(targetDir, safeFileName);
  await fsp.rename(input.file.path, targetPath);

  const cleanupIndex = input.cleanupTargets.indexOf(input.file.path);
  if (cleanupIndex >= 0) {
    input.cleanupTargets.splice(cleanupIndex, 1);
  }

  const stat = await fsp.stat(targetPath);
  const storageSegment = input.assetType === 'image' ? 'image' : '3d-model';
  const entryPoint = `/assets/projects/${encodeURIComponent(input.projectId)}/${storageSegment}/${encodeURIComponent(input.assetId)}/${encodeURIComponent(safeFileName)}`;
  const entryPointUrl = `${input.publicBaseUrl}${entryPoint}`;
  const metadata = input.assetType === 'image'
    ? { openLimeLayout: 'image' as const, sourceUrl: input.sourceUrl }
    : { sourceUrl: input.sourceUrl };

  const updatedDoc = await updateDigitalAsset(
    input.projectId,
    input.assetId,
    {
      type: input.assetType,
      mimeType: input.file.mimetype,
      entrySize: stat.size,
      entryPointUrl,
      entryPoint,
      metadata,
    },
    input.userId,
  );

  if (!updatedDoc) {
    throw new Error(`Failed to persist upload metadata for asset "${input.assetId}"`);
  }

  return {
    assetId: input.assetId,
    type: input.assetType,
    entryPoint,
    entryPointUrl,
    entrySize: stat.size,
    storageDir: targetDir,
    fileName: safeFileName,
    warnings: input.warnings,
    sourceUrl: input.sourceUrl,
  };
}

async function ingest3DArchiveAsset(input: {
  projectId: string;
  assetId: string;
  extractedPath: string;
  detectedFiles: Array<{ name: string; path: string; type: string }>;
  primaryModelFile?: { name: string; path: string; type: string };
  userId: string;
  publicBaseUrl: string;
  sourceUrl: string;
  warnings: string[];
}): Promise<RemoteAssetIngestionResult> {
  const targetDir = projectModel3dAssetDir(input.projectId, input.assetId);
  await fsp.mkdir(targetDir, { recursive: true });
  await fse.copy(input.extractedPath, targetDir);

  const modelFiles = input.detectedFiles.filter((file) => file.type === '3d-model');
  const mainModelFile = input.primaryModelFile || selectPrimary3DModelFile(
    modelFiles.map((file) => ({ name: file.name, path: file.path, type: '3d-model' as const }))
  );

  if (!mainModelFile) {
    throw new Error('No 3D model files found in ZIP archive');
  }

  const normalizedEntryPointPath = normalizeRelativeAssetPath(mainModelFile.name);
  const encodedEntryPointPath = encodePathPreservingSlashes(normalizedEntryPointPath);
  const totalSize = await getDirectorySizeBytes(targetDir);
  const entryPoint = `/assets/projects/${encodeURIComponent(input.projectId)}/3d-model/${encodeURIComponent(input.assetId)}/${encodedEntryPointPath}`;
  const entryPointUrl = `${input.publicBaseUrl}${entryPoint}`;

  const updatedDoc = await updateDigitalAsset(
    input.projectId,
    input.assetId,
    {
      type: '3d-model',
      entrySize: totalSize,
      entryPointUrl,
      entryPoint,
      metadata: {
        sourceUrl: input.sourceUrl,
      },
    },
    input.userId,
  );

  if (!updatedDoc) {
    throw new Error(`Failed to persist upload metadata for asset "${input.assetId}"`);
  }

  return {
    assetId: input.assetId,
    type: '3d-model',
    entryPoint,
    entryPointUrl,
    entrySize: totalSize,
    storageDir: targetDir,
    fileName: normalizedEntryPointPath,
    warnings: input.warnings,
    sourceUrl: input.sourceUrl,
  };
}

async function ingestRtiArchiveAsset(input: {
  projectId: string;
  assetId: string;
  extractedPath: string;
  rtiDatasetRootRelativePath?: string;
  originalFile: PreparedAssetFile;
  userId: string;
  publicBaseUrl: string;
  sourceUrl: string;
}): Promise<RemoteAssetIngestionResult> {
  const targetDir = projectRtiAssetDir(input.projectId, input.assetId);
  await fsp.mkdir(targetDir, { recursive: true });

  const datasetRootPath = input.rtiDatasetRootRelativePath
    ? path.join(input.extractedPath, input.rtiDatasetRootRelativePath)
    : input.extractedPath;

  await copyDirectoryContents(datasetRootPath, targetDir);

  const infoJsonPath = path.join(targetDir, RTI_DATASET_INFO_FILE);
  const infoExists = await fse.pathExists(infoJsonPath);
  if (!infoExists) {
    throw new Error(`RTI archive missing required ${RTI_DATASET_INFO_FILE} at dataset root`);
  }

  const totalSize = await getDirectorySizeBytes(targetDir);
  const entryPoint = `/assets/projects/${encodeURIComponent(input.projectId)}/rti/${encodeURIComponent(input.assetId)}/${RTI_DATASET_INFO_FILE}`;
  const entryPointUrl = `${input.publicBaseUrl}${entryPoint}`;

  const updatedDoc = await updateDigitalAsset(
    input.projectId,
    input.assetId,
    {
      type: 'rti',
      mimeType: input.originalFile.mimetype,
      entrySize: totalSize,
      entryPointUrl,
      entryPoint,
      metadata: {
        rtiType: 'hsh',
        rtiLayout: 'deepzoom',
        zipName: input.originalFile.originalname,
        sourceUrl: input.sourceUrl,
      },
    },
    input.userId,
  );

  if (!updatedDoc) {
    throw new Error(`Failed to persist upload metadata for asset "${input.assetId}"`);
  }

  return {
    assetId: input.assetId,
    type: 'rti',
    entryPoint,
    entryPointUrl,
    entrySize: totalSize,
    storageDir: targetDir,
    fileName: input.originalFile.originalname,
    warnings: [],
    sourceUrl: input.sourceUrl,
  };
}
