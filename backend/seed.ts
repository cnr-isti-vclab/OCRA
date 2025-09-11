/**
 * Database Seeding Script
 * 
 * This script seeds the database with essential data that the application
 * requires to function properly. It runs on every startup to ensure
 * the required data is always present.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed roles - these are required for the application to function
 */
async function seedRoles(): Promise<void> {
  console.log('🌱 Seeding user roles...');
  
  const roles = [
    { 
      name: 'admin', 
      displayName: 'Administrator', 
      description: 'Full system access and user management' 
    },
    { 
      name: 'manager', 
      displayName: 'Manager', 
      description: 'Manage teams and review processes' 
    },
    { 
      name: 'editor', 
      displayName: 'Editor', 
      description: 'Edit content and collaborate on projects' 
    },
    { 
      name: 'viewer', 
      displayName: 'Viewer', 
      description: 'View content with read-only access' 
    }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: role.displayName,
        description: role.description
      },
      create: role
    });
    console.log(`  ✓ Role '${role.displayName}' ready`);
  }
  
  console.log('✅ Successfully seeded user roles');
}

/**
 * Seed admin user - ensures there's always an admin account
 */
async function seedAdminUser(): Promise<void> {
  console.log('🌱 Seeding administrator user...');
  
  const adminUser = {
    sub: 'admin-123-456-789',
    email: 'admin@example.com',
    name: 'System Administrator',
    username: 'admin',
    given_name: 'System',
    family_name: 'Administrator',
    sys_admin: true
  };

  const user = await prisma.user.upsert({
    where: { sub: adminUser.sub },
    update: {
      name: adminUser.name,
      email: adminUser.email,
      username: adminUser.username,
      given_name: adminUser.given_name,
      family_name: adminUser.family_name,
      sys_admin: true, // Ensure admin flag is always set
      updatedAt: new Date(),
    },
    create: adminUser
  });

  console.log(`  ✓ Administrator user ready: ${user.username} (${user.email})`);
  console.log('✅ Successfully seeded administrator user');
}

/**
 * Seed example projects - for demonstration and testing
 */
async function seedProjects(): Promise<void> {
  console.log('🌱 Seeding example projects...');
  
  const projects = [
    {
      name: 'Marble Head',
      description: 'Classical sculpture digitization project'
    },
    {
      name: 'Stanford Bunny', 
      description: '3D model processing and analysis'
    }
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { name: project.name },
      update: {
        description: project.description,
        updatedAt: new Date()
      },
      create: project
    });
    console.log(`  ✓ Project '${project.name}' created`);
  }
  
  console.log('✅ Successfully seeded 2 projects');
}

/**
 * Main seeding function
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting database seeding...');
    
    await seedRoles();
    await seedAdminUser();
    await seedProjects();
    
    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding
main()
  .catch((error) => {
    console.error('❌ Seeding script failed:', error);
    process.exit(1);
  });