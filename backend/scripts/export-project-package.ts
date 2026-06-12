import 'dotenv/config';
import path from 'path';
import fs from 'fs-extra';
import { PrismaClient } from '@prisma/client';
import { closeMongoClient } from '../src/lib/mongo/client.js';
import { findHdtByProjectId } from '../src/repositories/hdt.repository.js';
import { findAnnotationGeometriesByProjectId } from '../src/repositories/annotation-geometry.repository.js';
import { findAnnotationDataByProjectId } from '../src/repositories/annotation-data.repository.js';
import { findAnnotationLinksByProjectId } from '../src/repositories/annotation-link.repository.js';
import { projectModel3dDir, projectRtiDir, projectRoot } from '../src/utils/project-static-paths.js';
import {
  PROJECT_PACKAGE_FILES,
  PROJECT_PACKAGE_FORMAT,
  PROJECT_PACKAGE_VERSION,
  directoryHasEntries,
  stripMongoId,
  writeJsonFile,
  type ProjectPackageAnnotationsPayload,
  type ProjectPackageManifest,
  type ProjectPackageProjectPayload,
} from './project-package.js';

const prisma = new PrismaClient();

interface CliOptions {
  projectId: string;
  outputDir: string;
}

function printUsage() {
  console.log([
    'Usage:',
    '  tsx ./scripts/export-project-package.ts --project-id <projectId> [--output-dir <dir>]',
    '',
    'Notes:',
    '  - Exports one OCRA project as a directory package.',
    '  - Includes project metadata, HDT document, annotations, and canonical asset files.',
    '  - Excludes runtime-only state such as sessions, structuring locks, presence leases, and tmp files.',
  ].join('\n'));
}

function parseArgs(argv: string[]): CliOptions {
  let projectId = '';
  let outputDir = '';

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--help' || current === '-h') {
      printUsage();
      process.exit(0);
    }

    if (current === '--project-id') {
      projectId = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--output-dir') {
      outputDir = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!projectId.trim()) {
    throw new Error('Missing required --project-id');
  }

  const resolvedOutputDir = outputDir.trim()
    ? path.resolve(outputDir)
    : path.resolve(
      process.cwd(),
      'exports',
      `${projectId.trim()}-${new Date().toISOString().replaceAll(':', '-')}`,
    );

  return {
    projectId: projectId.trim(),
    outputDir: resolvedOutputDir,
  };
}

async function exportProjectPackage(options: CliOptions) {
  if (await directoryHasEntries(options.outputDir)) {
    throw new Error(`Output directory already exists and is not empty: ${options.outputDir}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: options.projectId },
    include: {
      projectRoles: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              sub: true,
              name: true,
              given_name: true,
              family_name: true,
              middle_name: true,
              sys_admin: true,
              sys_creator: true,
              isActive: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${options.projectId}`);
  }

  const [hdtDocument, geometries, data, links] = await Promise.all([
    findHdtByProjectId(options.projectId),
    findAnnotationGeometriesByProjectId(options.projectId),
    findAnnotationDataByProjectId(options.projectId),
    findAnnotationLinksByProjectId(options.projectId),
  ]);

  const projectPayload: ProjectPackageProjectPayload = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      public: project.public,
      counter: project.counter.toString(),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    roleSnapshots: project.projectRoles.map((role) => ({
      role: role.role,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
      user: {
        id: role.user.id,
        email: role.user.email,
        username: role.user.username,
        sub: role.user.sub,
        name: role.user.name,
        given_name: role.user.given_name,
        family_name: role.user.family_name,
        middle_name: role.user.middle_name,
        sys_admin: role.user.sys_admin,
        sys_creator: role.user.sys_creator,
        isActive: role.user.isActive,
      },
    })),
  };

  const annotationsPayload: ProjectPackageAnnotationsPayload = {
    geometries: geometries.map(stripMongoId),
    data: data.map(stripMongoId),
    links: links.map(stripMongoId),
  };

  const manifest: ProjectPackageManifest = {
    format: PROJECT_PACKAGE_FORMAT,
    version: PROJECT_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    sourceProjectId: project.id,
    sourceProjectName: project.name,
    counts: {
      roleSnapshots: projectPayload.roleSnapshots.length,
      geometries: annotationsPayload.geometries.length,
      data: annotationsPayload.data.length,
      links: annotationsPayload.links.length,
    },
    includes: {
      hdt: hdtDocument !== null,
      annotations: true,
      files: false,
    },
  };

  await fs.ensureDir(options.outputDir);
  await writeJsonFile(path.join(options.outputDir, PROJECT_PACKAGE_FILES.manifest), manifest);
  await writeJsonFile(path.join(options.outputDir, PROJECT_PACKAGE_FILES.project), projectPayload);
  await writeJsonFile(path.join(options.outputDir, PROJECT_PACKAGE_FILES.annotations), annotationsPayload);

  if (hdtDocument) {
    await writeJsonFile(path.join(options.outputDir, PROJECT_PACKAGE_FILES.hdt), stripMongoId(hdtDocument));
  }

  const filesOutputDir = path.join(options.outputDir, PROJECT_PACKAGE_FILES.filesDir);
  const modelDir = projectModel3dDir(project.id);
  const rtiDir = projectRtiDir(project.id);
  let copiedFiles = false;

  if (await fs.pathExists(modelDir)) {
    await fs.copy(modelDir, path.join(filesOutputDir, '3d-model'));
    copiedFiles = true;
  }

  if (await fs.pathExists(rtiDir)) {
    await fs.copy(rtiDir, path.join(filesOutputDir, 'rti'));
    copiedFiles = true;
  }

  if (copiedFiles) {
    manifest.includes.files = true;
    await writeJsonFile(path.join(options.outputDir, PROJECT_PACKAGE_FILES.manifest), manifest);
  }

  console.log(`Exported project ${project.id} to ${options.outputDir}`);
  console.log(`Project root on server: ${projectRoot(project.id)}`);
  console.log(`Roles: ${manifest.counts.roleSnapshots}`);
  console.log(`Annotations: ${manifest.counts.geometries} geometries, ${manifest.counts.data} data, ${manifest.counts.links} links`);
  console.log(`HDT included: ${manifest.includes.hdt ? 'yes' : 'no'}`);
  console.log(`Files included: ${manifest.includes.files ? 'yes' : 'no'}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await exportProjectPackage(options);
}

main()
  .catch((error) => {
    console.error('Failed to export project package:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeMongoClient();
  });
