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
 * Main seeding function
 */
async function main() {
  try {
    console.log('🚀 Starting database seeding...');
    
    await seedRoles();
    
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
