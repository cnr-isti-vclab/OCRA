import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import type { AnnotationScopeType, AnnotationShape } from 'shared/annotation-types';

loadDotenv();

interface AnnotationTarget {
  scopeType: AnnotationScopeType;
  scopeId: string;
}

function isLocalhostDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return false;
  }

  return databaseUrl.includes('@localhost:5432/') || databaseUrl.includes('@127.0.0.1:5432/');
}

function isRepoLocalCliDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    return false;
  }

  return databaseUrl.includes('ocra_user:ocra_pass@localhost:5432/ocra');
}

function setDockerHostFallbackEnv() {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/oauth_demo?schema=public';
  process.env.DIRECT_URL = 'postgresql://postgres:postgres@localhost:5432/oauth_demo?schema=public';
  process.env.MONGO_URL = 'mongodb://127.0.0.1:27017/?directConnection=true';
}

function isPrismaConnectionError(error: unknown) {
  return error instanceof Error && /Authentication failed|Can't reach database server/i.test(error.message);
}

async function ensureReachableDatabaseConfig() {
  const currentDatabaseUrl = process.env.DATABASE_URL;

  if (isRepoLocalCliDatabaseUrl(currentDatabaseUrl)) {
    setDockerHostFallbackEnv();
    console.warn('Using local Docker PostgreSQL defaults instead of backend/.env local credentials.');
    return;
  }

  if (!isLocalhostDatabaseUrl(currentDatabaseUrl)) {
    return;
  }

  const probe = new PrismaClient();

  try {
    await probe.$queryRaw`SELECT 1`;
    return;
  } catch (error) {
    if (!isPrismaConnectionError(error)) {
      throw error;
    }

    setDockerHostFallbackEnv();
    console.warn('DATABASE_URL from .env is not usable; retrying with local Docker PostgreSQL defaults.');
  } finally {
    await probe.$disconnect();
  }
}

function getProjectIdFromArgs() {
  const projectId = process.argv[2]?.trim();
  return projectId && projectId.length > 0 ? projectId : null;
}

function buildTarget(projectHdt: {
  scenes?: Array<{ id: string }>;
  digitalAssets?: Array<{ id: string }>;
} | null): AnnotationTarget | null {
  const firstSceneId = projectHdt?.scenes[0]?.id;
  if (firstSceneId) {
    return { scopeType: 'scene', scopeId: firstSceneId };
  }

  const firstAssetId = projectHdt?.digitalAssets[0]?.id;
  if (firstAssetId) {
    return { scopeType: 'asset', scopeId: firstAssetId };
  }

  return null;
}

async function resolveActorUserId(projectId: string, prisma: PrismaClient) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      projectRoles: {
        select: {
          userId: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 1,
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    projectName: project.name,
    userId: project.projectRoles[0]?.userId ?? null,
  };
}

async function main() {
  await ensureReachableDatabaseConfig();

  const [dbModule, mongoClientModule, annotationServiceModule, hdtServiceModule] = await Promise.all([
    import('../db.js'),
    import('../src/lib/mongo/client.js'),
    import('../src/services/annotation.service.js'),
    import('../src/services/hdt-metadata.service.js'),
  ]);

  const { getPrismaClient } = dbModule;
  const { closeMongoClient } = mongoClientModule;
  const {
    createAnnotationData,
    createAnnotationGeometry,
    createAnnotationLink,
    getAnnotationData,
    getAnnotationGeometry,
    getAnnotationLink,
  } = annotationServiceModule;
  const { getHDTDocument } = hdtServiceModule;
  const prisma = getPrismaClient();

  const projectId = getProjectIdFromArgs();
  if (!projectId) {
    console.error('Usage: npm run seed:annotation -- <projectId>');
    process.exitCode = 1;
    await prisma.$disconnect();
    await closeMongoClient();
    return;
  }

  const actor = await resolveActorUserId(projectId, prisma);
  if (!actor) {
    console.error(`Project not found: ${projectId}`);
    process.exitCode = 1;
    await prisma.$disconnect();
    await closeMongoClient();
    return;
  }

  if (!actor.userId) {
    console.error(`Project ${projectId} has no assigned project member; cannot derive createdBy user.`);
    process.exitCode = 1;
    await prisma.$disconnect();
    await closeMongoClient();
    return;
  }

  const projectHdt = await getHDTDocument(projectId);
  if (!projectHdt) {
    console.error(`Project ${projectId} has no HDT document.`);
    process.exitCode = 1;
    await prisma.$disconnect();
    await closeMongoClient();
    return;
  }

  const target = buildTarget(projectHdt);
  if (!target) {
    console.error(`Project ${projectId} has no scenes or assets to reference in the test annotation.`);
    process.exitCode = 1;
    await prisma.$disconnect();
    await closeMongoClient();
    return;
  }

  const timestamp = new Date().toISOString();
  const shapes: AnnotationShape[] = [
    {
      type: 'ShapePoints',
      vertices: [[0, 0, 0]],
    },
  ];

  const geometryId = await createAnnotationGeometry(
    projectId,
    shapes,
    target.scopeType,
    target.scopeId,
    actor.userId,
  );
  if (!geometryId) {
    throw new Error('Failed to create annotation geometry.');
  }

  const dataId = await createAnnotationData(
    projectId,
    `Test annotation ${timestamp}`,
    'Generated for Swagger/API manual testing.',
    'test-annotation',
    {
      generatedBy: 'backend/scripts/create-test-annotation.ts',
      generatedAt: timestamp,
      note: 'Complete annotation seed for manual REST API testing.',
    },
    target.scopeType,
    target.scopeId,
    actor.userId,
  );
  if (!dataId) {
    throw new Error('Failed to create annotation data.');
  }

  const linkId = await createAnnotationLink(projectId, geometryId, dataId, actor.userId);
  if (!linkId) {
    throw new Error('Failed to create annotation link.');
  }

  const [geometry, data, link] = await Promise.all([
    getAnnotationGeometry(projectId, geometryId, true),
    getAnnotationData(projectId, dataId, true),
    getAnnotationLink(projectId, linkId, true),
  ]);

  console.log(
    JSON.stringify(
      {
        success: true,
        projectId,
        projectName: actor.projectName,
        scopeType: target.scopeType,
        scopeId: target.scopeId,
        createdBy: actor.userId,
        geometry,
        data,
        link,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  await closeMongoClient();
}

try {
  await main();
} catch (error) {
  console.error(
    'Failed to create test annotation:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}