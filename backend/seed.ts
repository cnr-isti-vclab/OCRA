import fs from 'fs/promises';
import path from 'path';
import { PrismaClient, RoleEnum } from '@prisma/client';
import { getAuditDb, getContentDb, closeMongoClient } from './src/lib/mongo/client.js';
import { ensureProjectSkeleton, projectModel3dAssetDir, projectModel3dDir } from './src/utils/project-static-paths.js';

const prisma = new PrismaClient();

const MODEL_FILE_NAME = 'Galassi-Allegoria_della_disperazione-Scan2014.glb';
const MODEL_SOURCE_PATH = `/app/media/Example-Galassi/${MODEL_FILE_NAME}`;

const DEMO_USERS = [
  {
    id: 'cmj6yge6h0000rx01k3p8gxl3',
    sub: 'cc927c12-8122-4191-9232-7a56bc02feed',
    email: 'admin@ocra.it',
    name: 'System Administrator',
    username: 'administrator',
    given_name: 'System',
    family_name: 'Administrator',
    sys_admin: true,
    sys_creator: false,
  },
  {
    id: 'cmj3xy3g90002rr2rmargdt5r',
    sub: '2f594010-e6d2-4f7b-8f2f-3d427de0f12f',
    email: 'conservator@example.com',
    name: 'Pinco Pallino',
    username: 'conservator',
    given_name: 'Pinco',
    family_name: 'Pallino',
    sys_admin: false,
    sys_creator: false,
  },
  {
    id: 'cmseedstudent0001rr2r85g3a9ca',
    sub: '4c421f42-1771-4d52-a4f5-0c1d6bb7d4de',
    email: 'student@example.com',
    name: 'Mario Rossi',
    username: 'student',
    given_name: 'Mario',
    family_name: 'Rossi',
    sys_admin: false,
    sys_creator: false,
  },
  {
    id: 'cmseedrestor0002rr2r85g3a9cb',
    sub: '7b2fd98d-95b1-429b-bf54-83376d232625',
    email: 'restorator@example.com',
    name: 'Anna Bianchi',
    username: 'restorator',
    given_name: 'Anna',
    family_name: 'Bianchi',
    sys_admin: false,
    sys_creator: false,
  },
  {
    id: 'cmj3xy3fx0000rr2rauvw5k0s',
    sub: 'f1f7db89-8a7f-4d74-a5da-1cf88c4fa1d2',
    email: 'labhead@example.com',
    name: 'Giulia Verdi',
    username: 'lab-head',
    given_name: 'Giulia',
    family_name: 'Verdi',
    sys_admin: false,
    sys_creator: false,
  },
  {
    id: 'cmj3xy3g40001rr2r85g3a9cc',
    sub: '8b7ad097-5c74-440a-bc4c-2fd3c5267338',
    email: 'director@example.com',
    name: 'Roberto Neri',
    username: 'museum-director',
    given_name: 'Roberto',
    family_name: 'Neri',
    sys_admin: false,
    sys_creator: true,
  },
] as const;

const GALASSI_PROJECT = {
  id: 'cmnqiksr50002f6afihzdzzxc',
  name: 'Monumento ai caduti della prima guerra mondiale (monumento ai caduti a cippo)',
  description: '',
  public: false,
  managerSub: 'cc927c12-8122-4191-9232-7a56bc02feed',
  createdAt: new Date('2026-04-08T20:42:07.889Z'),
  updatedAt: new Date('2026-04-08T20:42:26.728Z'),
} as const;

const GALASSI_ASSET = {
  id: 'asset_1775680954081_ij415dje8',
  sceneId: 'scene_1775680954084',
  uploadedAt: new Date('2026-04-08T20:42:34.275Z'),
  entrySize: 54881032,
} as const;

const GALASSI_VOCABULARY = {
  id: 'cmj3xy3ge0003rr2ru5k9afqk',
  name: 'Abaco del restauro',
  description: 'Raccomandazioni NorMaL - 1/88. Alterazioni macroscopiche dei materiali lapidei: lessico, (CNR-ICR, 1990, Roma);',
  public: true,
} as const;

const GALASSI_AUDIT_EVENTS = [
  {
    eventId: '77c3637a-dd72-470a-905a-c927add81625',
    ts: new Date('2026-04-08T20:42:07.910Z'),
    userSub: GALASSI_PROJECT.managerSub,
    action: 'project.create',
    resource: null,
    success: true,
    payload: {
      projectId: GALASSI_PROJECT.id,
      projectName: 'Allegoria della disperazione',
      description: '',
      public: false,
    },
  },
  {
    eventId: 'a778fe46-16e9-4642-8531-b069049c4511',
    ts: new Date('2026-04-08T20:42:26.740Z'),
    userSub: GALASSI_PROJECT.managerSub,
    action: 'project.update',
    resource: { type: 'project', id: GALASSI_PROJECT.id },
    success: true,
    payload: {
      projectId: GALASSI_PROJECT.id,
      patch: {
        name: GALASSI_PROJECT.name,
        description: null,
        public: false,
        managerId: 'cmj6yge6h0000rx01k3p8gxl3',
      },
    },
  },
  {
    eventId: '8afa23ce-365d-48a8-9e74-f4ef5ad4ab15',
    ts: new Date('2026-04-08T20:42:34.090Z'),
    userSub: GALASSI_PROJECT.managerSub,
    action: 'hdt.asset.create',
    resource: null,
    success: true,
    payload: {
      projectId: GALASSI_PROJECT.id,
      assetType: '3d-model',
      label: MODEL_FILE_NAME,
      title: 'Galassi-Allegoria_della_disperazione-Scan2014',
      entryPointUrl: null,
      entryPoint: null,
      mimeType: null,
      entrySize: null,
    },
  },
  {
    eventId: '96317128-cb08-4a5f-a2e3-0552ff9cda6b',
    ts: new Date('2026-04-08T20:42:34.289Z'),
    userSub: GALASSI_PROJECT.managerSub,
    action: 'hdt.asset.update',
    resource: null,
    success: true,
    payload: {
      projectId: GALASSI_PROJECT.id,
      assetId: GALASSI_ASSET.id,
      updateKeys: [
        'fileName',
        'entrySize',
        'entryPointUrl',
        'entryPoint',
        'mimeType',
        'uploadedAt',
        'type',
      ],
    },
  },
] as const;

function galassiEntryPoint(projectId: string) {
  return `/assets/projects/${projectId}/3d-model/${GALASSI_ASSET.id}/${MODEL_FILE_NAME}`;
}

function galassiEntryPointUrl(projectId: string) {
  return `http://localhost:3002${galassiEntryPoint(projectId)}`;
}

function buildGalassiScene(projectId: string) {
  return {
    projectId,
    models: [
      {
        id: GALASSI_ASSET.id,
        file: galassiEntryPointUrl(projectId),
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
    ],
    environment: {
      showGround: true,
      background: '#404040',
      headLightOffset: [0, 0],
    },
    enableControls: true,
    rotationUnits: 'rad',
  };
}

async function ensureUser(user: (typeof DEMO_USERS)[number]) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ id: user.id }, { email: user.email }, { sub: user.sub }],
    },
  });

  const data = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    username: user.username,
    given_name: user.given_name,
    family_name: user.family_name,
    sys_admin: user.sys_admin,
    sys_creator: user.sys_creator,
  };

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.user.create({
    data: {
      id: user.id,
      ...data,
    },
  });
}

async function seedUsers() {
  console.log('🌱 Seeding Keycloak-backed users into PostgreSQL...');

  const users = [];
  for (const user of DEMO_USERS) {
    const persistedUser = await ensureUser(user);
    users.push(persistedUser);
    console.log(`  ✓ User '${user.username}' ready`);
  }

  return users;
}

async function seedVocabulary() {
  console.log('🌱 Seeding vocabularies...');

  const existing = await prisma.vocabulary.findFirst({
    where: {
      OR: [{ id: GALASSI_VOCABULARY.id }, { name: GALASSI_VOCABULARY.name }],
    },
  });

  const data = {
    name: GALASSI_VOCABULARY.name,
    description: GALASSI_VOCABULARY.description,
    public: GALASSI_VOCABULARY.public,
  };

  if (existing) {
    await prisma.vocabulary.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.vocabulary.create({
      data: {
        id: GALASSI_VOCABULARY.id,
        ...data,
      },
    });
  }

  console.log(`  ✓ Vocabulary '${GALASSI_VOCABULARY.name}' ready`);
}

async function seedProject(managerUserId: string) {
  console.log('🌱 Seeding Galassi project into PostgreSQL...');

  const existing = await prisma.project.findFirst({
    where: {
      OR: [{ id: GALASSI_PROJECT.id }, { name: GALASSI_PROJECT.name }],
    },
  });

  const projectData = {
    name: GALASSI_PROJECT.name,
    description: GALASSI_PROJECT.description,
    public: GALASSI_PROJECT.public,
  };

  const project = existing
    ? await prisma.project.update({
        where: { id: existing.id },
        data: projectData,
      })
    : await prisma.project.create({
        data: {
          id: GALASSI_PROJECT.id,
          ...projectData,
          createdAt: GALASSI_PROJECT.createdAt,
          updatedAt: GALASSI_PROJECT.updatedAt,
        },
      });

  await prisma.projectRole.upsert({
    where: {
      userId_projectId: {
        userId: managerUserId,
        projectId: project.id,
      },
    },
    update: {
      role: RoleEnum.manager,
    },
    create: {
      userId: managerUserId,
      projectId: project.id,
      role: RoleEnum.manager,
    },
  });

  console.log(`  ✓ Project '${project.name}' ready`);
  return project;
}

async function seedMongo(projectId: string) {
  console.log('🌱 Seeding MongoDB HDT and audit data...');

  const contentDb = await getContentDb();
  const auditDb = await getAuditDb();

  await contentDb.collection('hdt_collection').replaceOne(
    { projectId },
    {
      projectId,
      physicalObjectMetadata: {
        sourceUri: 'https://dati.cultura.gov.it/resource/HistoricOrArtisticProperty/0901078520',
        sourceType: 'arco',
        dublinCore: {
          title: GALASSI_PROJECT.name,
          creator: 'arco-res:Agent/9ae478e40ddf84c7d44b021320f8a0a7',
          subject: 'Allegoria della disperazione',
          description:
            'Monumento a cippo composto da una base composita in pietra e da una statua in bronzo soprastante. Il basamento è rivestito da cinque lastre in pietra metamorfica e reca sulla fronte una iscrizione a caratteri applicati, in parte perduti. La statua superiore, firmata sul retro di un basso basamento scabro da Elio Galassi e datata al 1924, rappresenta una donna a grandezza naturale inginocchiata e prostrata in avanti in segno di disperazione. La figura, nuda, è coperta da un leggerissimo manto delicatamente panneggiato sui fianchi, che lascia parzialmente scoperta la parte inferiore della schiena; il capo è cinto da una benda posta sulla fronte che lascia liberi di cadere verso terra i lunghi capelli della nuca ai lati del volto rivolto verso il basso. Le mani sono protese in avanti, in totale abbandono',
          publisher: 'arco-res:Agent/eadb82aaf3a73512cbe8b13b8a7e3fba',
          contributor: 'arco-res:AgentRole/0901078520-heritage-protection-agency, arco-res:AgentRole/0901078520-cataloguing-agency',
          date: '1924-1924',
          type: 'monumento ai caduti a cippo, arco-res:CulturalPropertyType/59e7365a26e8a8580695f5b7e179e07c, arco:MovableCulturalProperty, arco:HistoricOrArtisticProperty',
          format: 'arco-res:MeasurementCollection/0901078520-1',
          identifier: '0901078520',
          source: 'arco-res:CatalogueRecordOA/0901078520, https://catalogo.beniculturali.it/detail/HistoricOrArtisticProperty/0901078520',
          coverage: 'Pisa (PI)',
          rights: 'proprietà Ente pubblico territoriale',
        },
        cidocCrm: {},
        sourceRecord: {
          endpoint:
            'https://dati.cultura.gov.it/lodview-arco/resource/HistoricOrArtisticProperty/0901078520.html?output=application%2Fld%2Bjson',
          catalogId: '0901078520',
          importedAt: '2026-04-08T20:42:14.893Z',
          sourceUri: 'https://dati.cultura.gov.it/resource/HistoricOrArtisticProperty/0901078520',
          contentType: 'application/ld+json;charset=UTF-8',
          recordId: 'arco-res:HistoricOrArtisticProperty/0901078520',
          candidateRecordCount: 1,
        },
      },
      digitalAssets: [
        {
          id: GALASSI_ASSET.id,
          projectId,
          type: '3d-model',
          label: MODEL_FILE_NAME,
          title: 'Galassi-Allegoria_della_disperazione-Scan2014',
          description: null,
          entryPointUrl: galassiEntryPointUrl(projectId),
          entryPoint: galassiEntryPoint(projectId),
          mimeType: 'model/gltf-binary',
          entrySize: GALASSI_ASSET.entrySize,
          metadata: {},
          uploadedAt: GALASSI_ASSET.uploadedAt,
          uploadedBy: GALASSI_PROJECT.managerSub,
          fileName: MODEL_FILE_NAME,
        },
      ],
      scenes: [
        {
          id: GALASSI_ASSET.sceneId,
          label: 'Default Scene',
          description: 'Default scene created automatically',
          isDefault: true,
          assets: [{ assetId: GALASSI_ASSET.id, visible: true }],
          environment: { showGround: true, backgroundColor: '#404040' },
        },
      ],
      createdAt: new Date('2026-04-08T20:42:14.907Z'),
      updatedAt: new Date('2026-04-08T20:42:34.287Z'),
      createdBy: GALASSI_PROJECT.managerSub,
      updatedBy: GALASSI_PROJECT.managerSub,
    },
    { upsert: true }
  );

  for (const event of GALASSI_AUDIT_EVENTS) {
    await auditDb.collection('audit').replaceOne({ eventId: event.eventId }, event, { upsert: true });
  }

  console.log('  ✓ MongoDB HDT document ready');
  console.log('  ✓ MongoDB audit trail ready');
}

async function seedProjectFiles(projectId: string) {
  console.log('🌱 Seeding project_files for Galassi asset...');

  ensureProjectSkeleton(projectId);

  const assetDir = projectModel3dAssetDir(projectId, GALASSI_ASSET.id);
  const scenePath = path.join(projectModel3dDir(projectId), 'scene.json');
  const targetModelPath = path.join(assetDir, MODEL_FILE_NAME);

  await fs.mkdir(assetDir, { recursive: true });
  await fs.copyFile(MODEL_SOURCE_PATH, targetModelPath);
  await fs.writeFile(scenePath, `${JSON.stringify(buildGalassiScene(projectId), null, 2)}\n`, 'utf8');

  console.log(`  ✓ Asset copied to ${targetModelPath}`);
  console.log(`  ✓ Scene file written to ${scenePath}`);
}

async function main() {
  console.log('🌱 Starting OCRA full demo seed...');
  console.log('   Keycloak users are imported separately from keycloak/realm-export/demo-realm.json');
  console.log('');

  const users = await seedUsers();
  const manager = users.find((user) => user.sub === GALASSI_PROJECT.managerSub);
  if (!manager) {
    throw new Error(`Manager user ${GALASSI_PROJECT.managerSub} not found after seeding users`);
  }

  await seedVocabulary();
  const project = await seedProject(manager.id);
  await seedMongo(project.id);
  await seedProjectFiles(project.id);

  console.log('');
  console.log('✅ OCRA demo seed completed');
  console.log(`   Project: ${project.name}`);
  console.log(`   Asset: ${MODEL_FILE_NAME}`);
  console.log('   Keycloak realm: demo');
  console.log('');
  console.log('👤 Demo users ready:');
  console.log('   - administrator / admin@ocra.it');
  console.log('   - museum-director / museum-director');
  console.log('   - lab-head / lab-head');
  console.log('   - conservator / conservator');
  console.log('   - student / student');
  console.log('   - restorator / restorator');
  console.log('');
}

main()
  .catch((error) => {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeMongoClient();
  });