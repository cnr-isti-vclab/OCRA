import path from 'path';
import fsp from 'fs/promises';
import fse from 'fs-extra';
import {
  ensureProjectSkeleton,
  projectModel3dAssetDir,
  projectRtiAssetDir,
} from '../utils/project-static-paths.js';
import { downloadRemoteAssetToProjectTemp, type RemoteAssetBasicAuth } from './remote-asset-import.service.js';
import {
  prepareAssetProcessingFromLocalFile,
  RTI_DATASET_INFO_FILE,
  type PreparedAssetFile,
  type PreparedAssetProcessing,
} from './asset-ingestion.service.js';
import { updateDigitalAsset } from './hdt-metadata.service.js';
import { selectPrimary3DModelFile } from './model-archive-utils.js';

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
}

export interface RemoteAssetIngestionResult {
  assetId: string;
  type: '3d-model' | 'rti';
  entryPoint: string;
  entryPointUrl: string;
  entrySize: number;
  storageDir: string;
  fileName: string;
  warnings: string[];
  sourceUrl: string;
}

export async function ingestRemoteAssetIntoExistingAsset(
  input: RemoteAssetIngestionInput
): Promise<RemoteAssetIngestionResult> {
  const cleanupTargets: string[] = [];

  try {
    ensureProjectSkeleton(input.projectId);

    const download = await downloadRemoteAssetToProjectTemp(input.projectId, input.sourceUrl, input.auth);
    cleanupTargets.push(download.file.path);

    const prepared = await prepareAssetProcessingFromLocalFile({ file: download.file });
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
    case '3d-direct':
      return ingestDirect3DAsset({
        projectId,
        assetId,
        file: originalFile,
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

async function ingestDirect3DAsset(input: {
  projectId: string;
  assetId: string;
  file: PreparedAssetFile;
  userId: string;
  publicBaseUrl: string;
  sourceUrl: string;
  cleanupTargets: string[];
  warnings: string[];
}): Promise<RemoteAssetIngestionResult> {
  const targetDir = projectModel3dAssetDir(input.projectId, input.assetId);
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
  const entryPoint = `/assets/projects/${encodeURIComponent(input.projectId)}/3d-model/${encodeURIComponent(input.assetId)}/${encodeURIComponent(safeFileName)}`;
  const entryPointUrl = `${input.publicBaseUrl}${entryPoint}`;

  const updatedDoc = await updateDigitalAsset(
    input.projectId,
    input.assetId,
    {
      type: '3d-model',
      mimeType: input.file.mimetype,
      entrySize: stat.size,
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
