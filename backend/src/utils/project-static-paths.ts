import path from 'path';
import fs from 'fs';

const PROJECT_FILES_ROOT = path.resolve(
  process.env.PROJECT_FILES_PATH || '/app/project_files'
);

export function projectRoot(projectId: string) {
  return path.join(PROJECT_FILES_ROOT, projectId);
}

export function projectTmpDir(projectId: string) {
  return path.join(projectRoot(projectId), 'tmp');
}

export function projectModel3dDir(projectId: string) {
  return path.join(projectRoot(projectId), '3d-model');
}

export function projectModel3dAssetDir(projectId: string, assetId: string) {
  return path.join(projectModel3dDir(projectId), assetId);
}

export function projectRtiDir(projectId: string) {
  return path.join(projectRoot(projectId), 'rti');
}

export function projectRtiAssetDir(projectId: string, assetId: string) {
  return path.join(projectRtiDir(projectId), assetId);
}

/** Returns the directory containing all directly viewable image assets for a project. */
export function projectImageDir(projectId: string) {
  return path.join(projectRoot(projectId), 'image');
}

/** Returns the storage directory owned by one directly viewable image asset. */
export function projectImageAssetDir(projectId: string, assetId: string) {
  return path.join(projectImageDir(projectId), assetId);
}

export function projectEchoesDir(projectId: string) {
  return path.join(projectRoot(projectId), 'echoes');
}

export function ensureProjectSkeleton(projectId: string) {
  fs.mkdirSync(projectModel3dDir(projectId), { recursive: true });
  fs.mkdirSync(projectRtiDir(projectId), { recursive: true });
  fs.mkdirSync(projectImageDir(projectId), { recursive: true });
  fs.mkdirSync(projectTmpDir(projectId), { recursive: true });
  fs.mkdirSync(projectEchoesDir(projectId), { recursive: true });
}
