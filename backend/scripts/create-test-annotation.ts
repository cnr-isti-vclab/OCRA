import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import type { AnnotationScopeType, AnnotationShape } from 'shared/annotation-types';

loadDotenv();

interface AnnotationTarget {
  scopeType: AnnotationScopeType;
  scopeId: string;
}

interface SeededAnnotationSet {
  geometries: unknown[];
  data: unknown;
  links: unknown[];
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

async function clearProjectAnnotations(projectId: string) {
  const [geometryRepoModule, dataRepoModule, linkRepoModule] = await Promise.all([
    import('../src/repositories/annotation-geometry.repository.js'),
    import('../src/repositories/annotation-data.repository.js'),
    import('../src/repositories/annotation-link.repository.js'),
  ]);

  const [geometryCollection, dataCollection, linkCollection] = await Promise.all([
    geometryRepoModule.getAnnotationGeometryCollection(),
    dataRepoModule.getAnnotationDataCollection(),
    linkRepoModule.getAnnotationLinkCollection(),
  ]);

  const [deletedLinks, deletedData, deletedGeometries] = await Promise.all([
    linkCollection.deleteMany({ projectId }),
    dataCollection.deleteMany({ projectId }),
    geometryCollection.deleteMany({ projectId }),
  ]);

  return {
    links: deletedLinks.deletedCount ?? 0,
    data: deletedData.deletedCount ?? 0,
    geometries: deletedGeometries.deletedCount ?? 0,
  };
}

function buildGeometryShapes(): AnnotationShape[][] {
  return [
    [
      {
        type: 'ShapePoints',
        vertices: [[0, 0, 0]],
      },
    ],
    [
      {
        type: 'ShapePoints',
        vertices: [[1.5, 0.5, 0.25]],
      },
    ],
  ];
}

async function createAnnotationSet(
  projectId: string,
  target: AnnotationTarget,
  actorUserId: string,
  annotationServiceModule: {
    createAnnotationData: typeof import('../src/services/annotation.service.js').createAnnotationData;
    createAnnotationGeometry: typeof import('../src/services/annotation.service.js').createAnnotationGeometry;
    createAnnotationLink: typeof import('../src/services/annotation.service.js').createAnnotationLink;
    getAnnotationData: typeof import('../src/services/annotation.service.js').getAnnotationData;
    getAnnotationGeometry: typeof import('../src/services/annotation.service.js').getAnnotationGeometry;
    getAnnotationLink: typeof import('../src/services/annotation.service.js').getAnnotationLink;
  },
): Promise<SeededAnnotationSet> {
  const {
    createAnnotationData,
    createAnnotationGeometry,
    createAnnotationLink,
    getAnnotationData,
    getAnnotationGeometry,
    getAnnotationLink,
  } = annotationServiceModule;

  const timestamp = new Date().toISOString();
  const geometryShapeSets = buildGeometryShapes();

  const geometryIds: string[] = [];
  for (const [index, shapes] of geometryShapeSets.entries()) {
    const geometryResult = await createAnnotationGeometry(
      projectId,
      shapes,
      target.scopeType,
      target.scopeId,
      actorUserId,
    );

    if (!geometryResult.ok) {
      throw new Error(`Failed to create annotation geometry ${index + 1}: ${geometryResult.code}.`);
    }

    geometryIds.push(geometryResult.value);
  }

  const dataResult = await createAnnotationData(
    projectId,
    `Shared test annotation ${timestamp}`,
    'Generated for Swagger/API manual testing with two geometries linked to the same data annotation.',
    'test-annotation-shared-data',
    {
      generatedBy: 'backend/scripts/create-test-annotation.ts',
      generatedAt: timestamp,
      note: 'Manual REST API dataset: 2 geometry annotations, 1 data annotation, 2 links.',
      linkedGeometryCount: geometryIds.length,
    },
    target.scopeType,
    target.scopeId,
    actorUserId,
  );
  if (!dataResult.ok) {
    throw new Error(`Failed to create shared annotation data: ${dataResult.code}.`);
  }

  const dataId = dataResult.value;

  const linkIds: string[] = [];
  for (const geometryId of geometryIds) {
    const linkResult = await createAnnotationLink(projectId, geometryId, dataId, actorUserId);
    if (!linkResult.ok) {
      throw new Error(`Failed to create annotation link for geometry ${geometryId}: ${linkResult.code}.`);
    }

    linkIds.push(linkResult.value);
  }

  const [geometries, data, links] = await Promise.all([
    Promise.all(geometryIds.map((geometryId) => getAnnotationGeometry(projectId, geometryId, true))),
    getAnnotationData(projectId, dataId, true),
    Promise.all(linkIds.map((linkId) => getAnnotationLink(projectId, linkId, true))),
  ]);

  return {
    geometries,
    data,
    links,
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

  const deleted = await clearProjectAnnotations(projectId);
  const seeded = await createAnnotationSet(projectId, target, actor.userId, annotationServiceModule);

  console.log(
    JSON.stringify(
      {
        success: true,
        projectId,
        projectName: actor.projectName,
        scopeType: target.scopeType,
        scopeId: target.scopeId,
        createdBy: actor.userId,
        removedExistingAnnotations: deleted,
        summary: {
          geometryCount: seeded.geometries.length,
          dataCount: seeded.data ? 1 : 0,
          linkCount: seeded.links.length,
        },
        geometries: seeded.geometries,
        data: seeded.data,
        links: seeded.links,
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