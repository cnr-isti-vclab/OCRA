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
async function seedRoles() {
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
      description: 'Create and edit content' 
    },
    { 
      name: 'viewer', 
      displayName: 'Viewer', 
      description: 'View content only' 
    }
  ];

  for (const role of roles) {
    const result = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: role.displayName,
        description: role.description
      },
      create: role
    });
    
    console.log(`  ✓ Role '${role.name}' (${role.displayName})`);
  }
  
  console.log(`✅ Successfully seeded ${roles.length} roles`);
}

/**
 * Seed administrator user
 */
async function seedAdminUser() {
  console.log('🌱 Seeding administrator user...');
  
  const adminUser = {
    sub: 'admin-ocra-system', // Unique OAuth subject for the admin user
    email: 'admin@ocra.it',
    name: 'Administrator',
    username: 'Administrator',
    given_name: 'System',
    family_name: 'Administrator',
    roleId: 'admin', // Admin role
    sys_admin: true // System administrator flag
  };

  const result = await prisma.user.upsert({
    where: { sub: adminUser.sub },
    update: {
      email: adminUser.email,
      name: adminUser.name,
      username: adminUser.username,
      given_name: adminUser.given_name,
      family_name: adminUser.family_name,
      roleId: adminUser.roleId,
      sys_admin: adminUser.sys_admin,
      updatedAt: new Date(),
    },
    create: adminUser
  });
  
  console.log(`  ✓ Administrator user created with email: ${adminUser.email}`);
  console.log(`✅ Successfully seeded administrator user`);
}

/**
 * Seed example projects
 */
async function seedProjects() {
  console.log('🌱 Seeding example projects...');
  
  const projects = [
    {
      name: 'Marble Head',
      description: 'A classical marble sculpture head project for detailed scanning and reconstruction analysis.'
    },
    {
      name: 'Stanford Bunny',
      description: 'The famous Stanford Bunny 3D model used for computer graphics research and testing.'
    }
  ];

  for (const project of projects) {
    const result = await prisma.project.upsert({
      where: { name: project.name },
      update: {
        description: project.description,
        updatedAt: new Date(),
      },
      create: project
    });
    
    console.log(`  ✓ Project '${project.name}' created`);
  }
  
  console.log(`✅ Successfully seeded ${projects.length} projects`);
}

/**
 * Main seeding function
 */
async function main() {
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

// Run seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as seedDatabase };
