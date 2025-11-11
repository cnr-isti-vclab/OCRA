/**
 * Database Seeding Script
 * 
 * This script seeds the database with required data and some sample data to allow to test the application
 * properly. It runs on every time the db volume is created to ensure the required data is always present.
 * 
 * Note: Projects are NOT seeded here. They should be created through the UI to ensure compatibility
 * with the new multi-scene HDT architecture. After creating a sample project, we can update this seed
 * to include proper project seeding.
 */

import { PrismaClient, RoleEnum } from '@prisma/client';

const prisma = new PrismaClient();

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
      given_name: 'Francesca',
      family_name: 'Rossi'
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
  console.log('🌱 Starting database seeding...');
  console.log('');
  console.log('📝 Note: Projects are NOT seeded automatically.');
  console.log('   Create sample projects through the UI to ensure compatibility');
  console.log('   with the new multi-scene HDT architecture.');
  console.log('');
  
  await seedDemoUsers();
  await seedDemoVocabularies();

  console.log('');
  console.log('✅ Database seeding completed');
  console.log('');
  console.log('👤 Demo users created:');
  console.log('   - museum-director (sys_creator)');
  console.log('   - lab-head');
  console.log('   - conservator');
  console.log('');
  console.log('📚 Demo vocabularies created:');
  console.log('   - Abaco del restauro');
  console.log('');
}

main()
  .catch(e => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });