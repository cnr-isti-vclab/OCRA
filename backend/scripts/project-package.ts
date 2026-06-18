import path from 'path';
import fs from 'fs-extra';
import type { HDTDocument } from '../src/types/index.js';
import type {
  AnnotationDataDocument,
  AnnotationGeometryDocument,
  AnnotationLinkDocument,
} from '../src/repositories/annotation.repository.types.js';

export const PROJECT_PACKAGE_FORMAT = 'ocra-project-package';
export const PROJECT_PACKAGE_VERSION = 1;

export const PROJECT_PACKAGE_FILES = {
  manifest: 'manifest.json',
  project: 'project.json',
  hdt: 'hdt.json',
  annotations: 'annotations.json',
  filesDir: 'files',
  model3dDir: path.join('files', '3d-model'),
  rtiDir: path.join('files', 'rti'),
} as const;

export interface ProjectRoleSnapshot {
  role: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    username: string | null;
    sub: string;
    name: string | null;
    given_name: string | null;
    family_name: string | null;
    middle_name: string | null;
    sys_admin: boolean;
    sys_creator: boolean;
    isActive: boolean;
  };
}

export interface ExportedProjectSnapshot {
  id: string;
  name: string;
  description: string;
  public: boolean;
  counter: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPackageProjectPayload {
  project: ExportedProjectSnapshot;
  roleSnapshots: ProjectRoleSnapshot[];
}

export interface ProjectPackageAnnotationsPayload {
  geometries: AnnotationGeometryDocument[];
  data: AnnotationDataDocument[];
  links: AnnotationLinkDocument[];
}

export interface ProjectPackageManifest {
  format: typeof PROJECT_PACKAGE_FORMAT;
  version: typeof PROJECT_PACKAGE_VERSION;
  exportedAt: string;
  sourceProjectId: string;
  sourceProjectName: string;
  counts: {
    roleSnapshots: number;
    geometries: number;
    data: number;
    links: number;
  };
  includes: {
    hdt: boolean;
    annotations: boolean;
    files: boolean;
  };
}

export interface LoadedProjectPackage {
  manifest: ProjectPackageManifest;
  projectPayload: ProjectPackageProjectPayload;
  hdtDocument: HDTDocument | null;
  annotationsPayload: ProjectPackageAnnotationsPayload;
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
}

export async function writeJsonFile(targetPath: string, value: unknown) {
  await fs.outputFile(targetPath, `${JSON.stringify(value, jsonReplacer, 2)}\n`, 'utf8');
}

export async function readJsonFile<T>(targetPath: string): Promise<T> {
  return fs.readJson(targetPath) as Promise<T>;
}

export function stripMongoId<T extends { _id?: unknown }>(value: T): Omit<T, '_id'> {
  const { _id: _ignored, ...rest } = value;
  return rest;
}

export async function directoryHasEntries(targetPath: string) {
  if (!(await fs.pathExists(targetPath))) {
    return false;
  }

  const entries = await fs.readdir(targetPath);
  return entries.length > 0;
}

export async function readProjectPackage(packageDir: string): Promise<LoadedProjectPackage> {
  const manifestPath = path.join(packageDir, PROJECT_PACKAGE_FILES.manifest);
  const projectPath = path.join(packageDir, PROJECT_PACKAGE_FILES.project);
  const hdtPath = path.join(packageDir, PROJECT_PACKAGE_FILES.hdt);
  const annotationsPath = path.join(packageDir, PROJECT_PACKAGE_FILES.annotations);

  const manifest = await readJsonFile<ProjectPackageManifest>(manifestPath);
  const projectPayload = await readJsonFile<ProjectPackageProjectPayload>(projectPath);
  const annotationsPayload = await readJsonFile<ProjectPackageAnnotationsPayload>(annotationsPath);
  const hdtDocument = (await fs.pathExists(hdtPath))
    ? await readJsonFile<HDTDocument>(hdtPath)
    : null;

  return {
    manifest,
    projectPayload,
    hdtDocument,
    annotationsPayload,
  };
}
