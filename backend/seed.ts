/**
 * Database Seeding Script
 * 
 * This script seeds the database with required data and some sample data to allow to test the application
 * properly. It runs on every time the db volume is created to ensure the required data is always present.
 */

import { PrismaClient, RoleEnum } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Get the project files directory from environment or use default
const PROJECT_FILES_PATH = process.env.PROJECT_FILES_PATH || '/app/project_files';
const MEDIA_SOURCE_PATH = path.resolve(__dirname, '../media');

// project Json data
const sampleProjectData = [
  {
  "models": [
    {
      "id": "lion_crushing_a_serpent_t1k",
      "title" : "Lion Crushing a Serpent",
      "file": "lion_crushing_a_serpent_t1k.glb",
      "visible": true,
      "rotation": [180, 0, 0] 
    }
  ],
  "environment": {
    "showGround": true,
    "background": "#404040"
  },
  "enableControls": true
  },
  {
  "models": [
    {
      "id": "louis_xiv_de_france_louvre_paris_t1k",
      "title": "Louis XIV de France",
      "file": "louis_xiv_de_france_louvre_paris_t1k.glb",
      "rotation": [180, 0, 0],   
      "visible": true
    }
  ],
  "environment": {
    "showGround": true,
    "background": "#404040"
  },
  "enableControls": true
}
];


/**
 * Populate project folders with scene.json and model files
 * Maps project names to their scene data and copies files from media folder
 */
async function populateProjectFolders(): Promise<void> {
  console.log('📁 Populating project folders with scene.json and model files...');

  // Mapping of project names to their scene data index and model files
  const projectMapping = [
    {
      projectName: 'Lion Crushing a Serpent',
      sceneDataIndex: 0,
      modelFiles: ['lion_crushing_a_serpent_t1k.glb']
    },
    {
      projectName: 'louis_xiv_de_france',
      sceneDataIndex: 1,
      modelFiles: ['louis_xiv_de_france_louvre_paris_t1k.glb']
    }
  ];

  for (const mapping of projectMapping) {
    try {
      // Get the project from database
      const project = await prisma.project.findUnique({
        where: { name: mapping.projectName }
      });

      if (!project) {
        console.log(`  ⚠️  Project '${mapping.projectName}' not found, skipping folder population`);
        continue;
      }

      // Create project folder
      const projectFolder = path.join(PROJECT_FILES_PATH, project.id);
      fs.mkdirSync(projectFolder, { recursive: true });

      // Write scene.json
      const sceneData = sampleProjectData[mapping.sceneDataIndex];
      const sceneJsonPath = path.join(projectFolder, 'scene.json');
      fs.writeFileSync(sceneJsonPath, JSON.stringify(sceneData, null, 2), 'utf-8');
      console.log(`  ✓ Created scene.json for '${mapping.projectName}'`);

      // Copy model files from media folder
      for (const modelFile of mapping.modelFiles) {
        const sourcePath = path.join(MEDIA_SOURCE_PATH, modelFile);
        const destPath = path.join(projectFolder, modelFile);

        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`  ✓ Copied ${modelFile} to '${mapping.projectName}' folder`);
        } else {
          console.log(`  ⚠️  Model file ${modelFile} not found in media folder, skipping`);
        }
      }

    } catch (error: any) {
      console.error(`  ❌ Error populating folder for '${mapping.projectName}':`, error.message);
    }
  }

  console.log('✅ Successfully populated project folders');
}

/**
 * Seed example projects - for demonstration and testing
 */
async function seedDemoProjects(): Promise<void> {
  console.log('🌱 Seeding example projects...');
  
  const projects = [
    {
      name: 'Marble Head',
      description: 'Classical sculpture digitization project',
      public: true
    },
    {
      name: 'Lion Crushing a Serpent', 
      description: 'A 3D model of a lion crushing a serpent, used for testing purposes',
      public: false
    },
    {
      name: 'louis_xiv_de_france',
      description: 'Renaissance sculpture digitization and restoration',
      public: true
    },
    {
      name: 'Empty Project',
      description: 'To be used to test adding models',
      public: true
    }
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { name: project.name },
      update: {
        description: project.description,
        public: project.public,
        updatedAt: new Date()
      },
      create: project
    });
    console.log(`  ✓ Project '${project.name}' created`);
  }
  
  console.log('✅ Successfully seeded 4 projects');
}

/**
 * Seed demo users - create the users from Keycloak demo realm
 */
async function seedDemoUsers(): Promise<void> {
  console.log('🌱 Seeding demo users...');
  
  const demoUsers = [
    {
      sub: 'demo-lab-head-sub',
      email: 'labhead@example.com',
      name: 'Giulia Verdi',
      username: 'lab-head',
      given_name: 'Giulia',
      family_name: 'Verdi'
    },
    {
      sub: 'demo-museum-director-sub',
      email: 'director@example.com',
      name: 'Roberto Neri',
      username: 'museum-director',
      given_name: 'Roberto',
      family_name: 'Neri'
    },
    {
      sub: 'demo-museum-conservator-sub',
      email: 'conservator@example.com',
      name: 'Francesca Rossi',
      username: 'conservator',
      given_name: 'Pinco',
      family_name: 'Pallino'
    }
  ];

  for (const user of demoUsers) {
    // Grant sys_creator privilege to the demo museum director user
    const isSysCreator = user.username === 'museum-director';
    try {
      await prisma.user.upsert({
        where: { sub: user.sub },
        update: {
          name: user.name,
          email: user.email,
          username: user.username,
          given_name: user.given_name,
          family_name: user.family_name,
          sys_creator: isSysCreator,
          updatedAt: new Date()
        },
        create: {
          ...user,
          sys_creator: isSysCreator
        }
      });
      console.log(`  ✓ Demo user '${user.username}' ready`);
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        // Email already exists, skip this user
        console.log(`  ⚠️ Demo user '${user.username}' skipped (email already exists)`);
      } else {
        throw error;
      }
    }
  }
  
  console.log('✅ Successfully seeded demo users');
}

/**
 * Seed project roles - assign users to projects with specific roles,
 * to be run after seeding users and projects
 */
async function seedDemoProjectRoles(): Promise<void> {
  console.log('🌱 Seeding project roles...');

  // Helper to assign a role to a user for a project by email and project name
  async function assignProjectRole(email: string, projectName: string, role: RoleEnum) {
    const user = await prisma.user.findUnique({ where: { email } });
    const project = await prisma.project.findUnique({ where: { name: projectName } });
    if (!user || !project) {
      console.log(`  ⚠️  Skipping: user or project not found for email='${email}', project='${projectName}'`);
      return;
    }
    await prisma.projectRole.upsert({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: project.id
        }
      },
      update: {
        role: role,
        updatedAt: new Date()
      },
      create: {
        userId: user.id,
        projectId: project.id,
        role: role
      }
    });
    console.log(`  ✓ ${user.username} assigned as ${role} of '${project.name}' project`);
  }

  // Assign roles using the helper
  await assignProjectRole('labhead@example.com', 'Lion Crushing a Serpent', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'Marble Head', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'louis_xiv_de_france', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'Empty Project', RoleEnum.manager);
  await assignProjectRole('conservator@example.com', 'Lion Crushing a Serpent', RoleEnum.editor);

  console.log('✅ Successfully seeded project roles');
}

/**
 * Seed demo vocabularies - create controlled vocabularies and terminologies
 */
async function seedDemoVocabularies(): Promise<void> {
  console.log('🌱 Seeding demo vocabularies...');
  
  const vocabularies = [
    {
      name: 'Abaco del restauro',
      description: 'Raccomandazioni NorMaL - 1/88. Alterazioni macroscopiche dei materiali lapidei: lessico, (CNR-ICR, 1990, Roma);',
      public: true
    }
  ];

  for (const vocabulary of vocabularies) {
    await prisma.vocabulary.upsert({
      where: { name: vocabulary.name },
      update: {
        description: vocabulary.description,
        public: vocabulary.public,
        updatedAt: new Date()
      },
      create: vocabulary
    });
    console.log(`  ✓ Vocabulary '${vocabulary.name}' created`);
  }
  
  console.log('✅ Successfully seeded vocabularies');
}

// Execute the seed functions in order
async function main() {
  //await seedAdminUser();
  await seedDemoProjects();
  await seedDemoUsers();
  await seedDemoProjectRoles();
  await seedDemoVocabularies();
  await populateProjectFolders(); // Populate project folders with scene.json and model files

  console.log('✅ Database seeding completed');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });