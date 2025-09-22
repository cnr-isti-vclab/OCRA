/**
 * Database Seeding Script
 * 
 * This script seeds the database with required data and some sample data to allow to test the application
 * properly. It runs on every time the db volume is created to ensure the required data is always present.
 */

import { PrismaClient, RoleEnum } from '@prisma/client';

const prisma = new PrismaClient();

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
      name: 'Stanford Bunny', 
      description: '3D model processing and analysis',
      public: false
    },
    {
      name: 'Laurana',
      description: 'Renaissance sculpture digitization and restoration',
      public: true
    },
    {
      name: 'Stanford Lucy',
      description: 'High-resolution 3D model analysis and processing',
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
  await assignProjectRole('labhead@example.com', 'Stanford Bunny', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'Marble Head', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'Laurana', RoleEnum.manager);
  await assignProjectRole('director@example.com', 'Stanford Lucy', RoleEnum.manager);
  await assignProjectRole('conservator@example.com', 'Stanford Bunny', RoleEnum.editor);

  console.log('✅ Successfully seeded project roles');
}

// Execute the seed functions in order
async function main() {
  //await seedAdminUser();
  await seedDemoProjects();
  await seedDemoUsers();
  await seedDemoProjectRoles();

  console.log('✅ Database seeding completed');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });