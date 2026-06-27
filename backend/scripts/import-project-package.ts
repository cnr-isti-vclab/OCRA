import 'dotenv/config';
import path from 'path';
import fs from 'fs-extra';
import { PrismaClient } from '@prisma/client';
import { closeMongoClient } from '../src/lib/mongo/client.js';
import { insertHdtDocument, deleteHdtByProjectId } from '../src/repositories/hdt.repository.js';
import { getAnnotationGeometryCollection } from '../src/repositories/annotation-geometry.repository.js';
import { getAnnotationDataCollection } from '../src/repositories/annotation-data.repository.js';
import { getAnnotationLinkCollection, deleteAnnotationLinksByProjectId } from '../src/repositories/annotation-link.repository.js';
import { deleteAnnotationGeometriesByProjectId } from '../src/repositories/annotation-geometry.repository.js';
import { deleteAnnotationDataByProjectId } from '../src/repositories/annotation-data.repository.js';
import { ensureProjectSkeleton, projectModel3dDir, projectRtiDir, projectRoot } from '../src/utils/project-static-paths.js';
import {
  buildImportIdMaps,
  normalizeImportedHdtDocument,
  rewriteImportedAnnotations,
  rewriteImportedHdtDocument,
  syncLegacySceneFile,
} from '../src/services/project-import-rewrite.service.js';
import {
  PROJECT_PACKAGE_FILES,
  PROJECT_PACKAGE_FORMAT,
  PROJECT_PACKAGE_VERSION,
  readProjectPackage,
} from './project-package.js';

type RuntimeMode = 'bare' | 'compose';

const COMPOSE_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/oauth_demo?schema=public';
const COMPOSE_MONGO_URL = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';

interface CliOptions {
  inputDir: string;
  name?: string;
  description?: string;
  publicOverride?: boolean;
  managerUserId?: string;
  managerSub?: string;
  managerEmail?: string;
  runtime: RuntimeMode;
  projectFilesPath?: string;
}

function printUsage() {
  console.log([
    'Usage:',
    '  tsx ./scripts/import-project-package.ts --input-dir <dir> (--manager-user-id <id> | --manager-sub <sub> | --manager-email <email>) [--runtime bare|compose] [--project-files-path <path>] [--name <new name>] [--description <text>] [--public true|false]',
    '',
    'Notes:',
    '  - Runtime defaults to bare.',
    '  - Project files path defaults to PROJECT_FILES_PATH environment variable or /app/project_files.',
    '  - Always imports as a brand new project.',
    '  - Does not restore sessions, structuring locks, presence leases, or tmp files.',
    '  - Original role snapshots are preserved only in the package metadata; they are not reapplied.',
  ].join('\n'));
}

function parseBooleanFlag(raw: string, flagName: string) {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`Invalid value for ${flagName}: ${raw}`);
}

function resolveExistingInputDir(rawInputDir: string) {
  const trimmed = rawInputDir.trim();
  const candidates = [
    path.resolve(trimmed),
    path.resolve('..', trimmed),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function parseRuntimeFlag(raw: string | undefined): RuntimeMode {
  if (!raw || raw === 'bare') {
    return 'bare';
  }

  if (raw === 'compose') {
    return 'compose';
  }

  throw new Error(`Invalid value for --runtime: ${raw}`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: '',
    runtime: 'bare',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }

    if (current === '--input-dir') {
      options.inputDir = resolveExistingInputDir(argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (current === '--name') {
      options.name = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--description') {
      options.description = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--public') {
      options.publicOverride = parseBooleanFlag(argv[index + 1] ?? '', '--public');
      index += 1;
      continue;
    }

    if (current === '--runtime') {
      options.runtime = parseRuntimeFlag(argv[index + 1]);
      index += 1;
      continue;
    }

    if (current === '--manager-user-id') {
      options.managerUserId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--manager-sub') {
      options.managerSub = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--manager-email') {
      options.managerEmail = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--project-files-path') {
      options.projectFilesPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!options.inputDir.trim()) {
    throw new Error('Missing required --input-dir');
  }

  if (!options.managerUserId?.trim() && !options.managerSub?.trim() && !options.managerEmail?.trim()) {
    throw new Error('You must provide one of --manager-user-id, --manager-sub, or --manager-email');
  }

  return {
    ...options,
    inputDir: options.inputDir.trim(),
    name: options.name?.trim() || undefined,
    description: options.description?.trim() || undefined,
    managerUserId: options.managerUserId?.trim() || undefined,
    managerSub: options.managerSub?.trim() || undefined,
    managerEmail: options.managerEmail?.trim() || undefined,
    projectFilesPath: options.projectFilesPath?.trim() || undefined,
  };
}

function applyRuntimeEnvironment(runtime: RuntimeMode, projectFilesPath?: string) {
  if (runtime === 'compose') {
    process.env.DATABASE_URL = process.env.COMPOSE_DATABASE_URL || COMPOSE_DATABASE_URL;
    process.env.DIRECT_URL = process.env.COMPOSE_DIRECT_URL || process.env.DATABASE_URL;
    process.env.MONGO_URL = process.env.COMPOSE_MONGO_URL || COMPOSE_MONGO_URL;
  } else {
    process.env.DATABASE_URL = process.env.DATABASE_URL;
    process.env.DIRECT_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
    process.env.MONGO_URL = process.env.MONGO_URL;
  }

  if (projectFilesPath) {
    process.env.PROJECT_FILES_PATH = projectFilesPath;
  }
}

function buildBackupSuffix(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `_BK_${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function buildImportedName(baseName: string) {
  return `${baseName}${buildBackupSuffix()}`;
}

async function resolveManagerUser(prisma: PrismaClient, options: CliOptions) {
  if (options.managerUserId) {
    return prisma.user.findUnique({
      where: { id: options.managerUserId },
      select: { id: true, email: true, sub: true, isActive: true },
    });
  }

  if (options.managerSub) {
    return prisma.user.findUnique({
      where: { sub: options.managerSub },
      select: { id: true, email: true, sub: true, isActive: true },
    });
  }

  return prisma.user.findUnique({
    where: { email: options.managerEmail! },
    select: { id: true, email: true, sub: true, isActive: true },
  });
}

async function cleanupImportedProject(prisma: PrismaClient, projectId: string) {
  await Promise.allSettled([
    deleteHdtByProjectId(projectId),
    deleteAnnotationLinksByProjectId(projectId),
    deleteAnnotationGeometriesByProjectId(projectId),
    deleteAnnotationDataByProjectId(projectId),
    fs.remove(projectRoot(projectId)),
    prisma.projectRole.deleteMany({ where: { projectId } }),
    prisma.project.deleteMany({ where: { id: projectId } }),
  ]);
}

async function importProjectPackage(options: CliOptions) {
  const prisma = new PrismaClient();
  const projectPackage = await readProjectPackage(options.inputDir);

  if (projectPackage.manifest.format !== PROJECT_PACKAGE_FORMAT) {
    throw new Error(`Unsupported package format: ${projectPackage.manifest.format}`);
  }

  if (projectPackage.manifest.version !== PROJECT_PACKAGE_VERSION) {
    throw new Error(`Unsupported package version: ${projectPackage.manifest.version}`);
  }

  const managerUser = await resolveManagerUser(prisma, options);
  if (!managerUser) {
    throw new Error('Manager user not found');
  }

  if (!managerUser.isActive) {
    throw new Error(`Manager user is disabled: ${managerUser.email ?? managerUser.sub ?? managerUser.id}`);
  }

  const sourceProject = projectPackage.projectPayload.project;
  const requestedName = options.name || buildImportedName(sourceProject.name);

  const createdProject = await prisma.project.create({
    data: {
      name: requestedName,
      description: options.description ?? sourceProject.description,
      public: options.publicOverride ?? sourceProject.public,
      counter: BigInt(sourceProject.counter),
      projectRoles: {
        create: {
          userId: managerUser.id,
          role: 'manager',
        },
      },
    },
    select: {
      id: true,
      name: true,
      counter: true,
    },
  });

  try {
    const idMaps = buildImportIdMaps(projectPackage);
    const rewrittenHdtDocument = rewriteImportedHdtDocument(projectPackage, createdProject.id, idMaps);
    const importedHdtDocument = rewrittenHdtDocument
      ? normalizeImportedHdtDocument(rewrittenHdtDocument)
      : null;
    if (importedHdtDocument) {
      await insertHdtDocument(importedHdtDocument);
    }

    const rewrittenAnnotations = rewriteImportedAnnotations(projectPackage, createdProject.id, idMaps);

    const geometryCollection = await getAnnotationGeometryCollection();
    const dataCollection = await getAnnotationDataCollection();
    const linkCollection = await getAnnotationLinkCollection();

    const geometryDocs = rewrittenAnnotations.geometries;
    const dataDocs = rewrittenAnnotations.data;
    const linkDocs = rewrittenAnnotations.links;

    if (geometryDocs.length > 0) {
      await geometryCollection.insertMany(geometryDocs, { ordered: true });
    }

    if (dataDocs.length > 0) {
      await dataCollection.insertMany(dataDocs, { ordered: true });
    }

    if (linkDocs.length > 0) {
      await linkCollection.insertMany(linkDocs, { ordered: true });
    }

    ensureProjectSkeleton(createdProject.id);

    const packageFilesRoot = path.join(options.inputDir, PROJECT_PACKAGE_FILES.filesDir);
    const sourceModelDir = path.join(packageFilesRoot, '3d-model');
    const sourceRtiDir = path.join(packageFilesRoot, 'rti');

    if (await fs.pathExists(sourceModelDir)) {
      await fs.copy(sourceModelDir, projectModel3dDir(createdProject.id));
    }

    if (await fs.pathExists(sourceRtiDir)) {
      await fs.copy(sourceRtiDir, projectRtiDir(createdProject.id));
    }

    await syncLegacySceneFile(createdProject.id, importedHdtDocument);

    console.log(`Imported package ${options.inputDir}`);
    console.log(`New project id: ${createdProject.id}`);
    console.log(`New project name: ${createdProject.name}`);
    console.log(`Assigned manager: ${managerUser.email ?? managerUser.sub ?? managerUser.id}`);
    console.log(`Imported annotations: ${geometryDocs.length} geometries, ${dataDocs.length} data, ${linkDocs.length} links`);
    console.log(`Project files root: ${projectRoot(createdProject.id)}`);
  } catch (error) {
    await cleanupImportedProject(prisma, createdProject.id);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  applyRuntimeEnvironment(options.runtime, options.projectFilesPath);
  await importProjectPackage(options);
}

main()
  .catch((error) => {
    console.error('Failed to import project package:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient();
  });
