/**
 * Database Seeding Script
 * 
 * This script seeds the database with required data and some sample data to allow to test the application
 * properly. It runs on every time the db volume is created to ensure the required data is always present.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed basic roles - these are required for the application to function
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
 * Seed admin user (DEPRECATED - now handled dynamically)
 * 
 * Admin users are now created automatically when a user with the email
 * specified in SYS_ADMIN_EMAIL environment variable logs in for the first time.
 */
/*
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
*/

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
    }
  ];

  for (const user of demoUsers) {
    try {
      await prisma.user.upsert({
        where: { sub: user.sub },
        update: {
          name: user.name,
          email: user.email,
          username: user.username,
          given_name: user.given_name,
          family_name: user.family_name,
          updatedAt: new Date()
        },
        create: user
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
  

  // Get the projects and users
  const [marbleHeadProject, stanfordBunnyProject, lauranaProject, stanfordLucyProject] = await Promise.all([
    prisma.project.findUnique({ where: { name: 'Marble Head' } }),
    prisma.project.findUnique({ where: { name: 'Stanford Bunny' } }),
    prisma.project.findUnique({ where: { name: 'Laurana' } }),
    prisma.project.findUnique({ where: { name: 'Stanford Lucy' } })
  ]);

  const [labHeadUser, museumDirectorUser] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'labhead@example.com' } }),
    prisma.user.findUnique({ where: { email: 'director@example.com' } })
  ]);

  // Fetch role ids
  const managerRole = await prisma.role.findUnique({ where: { name: 'manager' } });
  if (!managerRole) {
    console.log('⚠️  Manager role not found, skipping project role seeding');
    return;
  }

  if (!marbleHeadProject || !stanfordBunnyProject || !lauranaProject || !stanfordLucyProject) {
    console.log('⚠️  Projects not found, skipping project role seeding');
    return;
  }

  if (!labHeadUser || !museumDirectorUser) {
    console.log('⚠️  Demo users not found, skipping project role seeding');
    return;
  }


  // Assign lab-head as manager of Stanford Bunny project
  await prisma.projectRole.upsert({
    where: {
      userId_projectId: {
        userId: labHeadUser.id,
        projectId: stanfordBunnyProject.id
      }
    },
    update: {
      roleId: managerRole.id,
      updatedAt: new Date()
    },
    create: {
      userId: labHeadUser.id,
      projectId: stanfordBunnyProject.id,
      roleId: managerRole.id
    }
  });
  console.log(`  ✓ ${labHeadUser.username} assigned as manager of '${stanfordBunnyProject.name}' project`);

  // Assign museum-director as manager of Marble Head project
  await prisma.projectRole.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: marbleHeadProject.id
      }
    },
    update: {
      roleId: managerRole.id,
      updatedAt: new Date()
    },
    create: {
      userId: museumDirectorUser.id,
      projectId: marbleHeadProject.id,
      roleId: managerRole.id
    }
  });
  console.log(`  ✓ ${museumDirectorUser.username} assigned as manager of '${marbleHeadProject.name}' project`);

  // Assign museum-director as manager of Laurana project
  await prisma.projectRole.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: lauranaProject.id
      }
    },
    update: {
      roleId: managerRole.id,
      updatedAt: new Date()
    },
    create: {
      userId: museumDirectorUser.id,
      projectId: lauranaProject.id,
      roleId: managerRole.id
    }
  });
  console.log(`  ✓ ${museumDirectorUser.username} assigned as manager of '${lauranaProject.name}' project`);

  // Assign museum-director as manager of Stanford Lucy project
  await prisma.projectRole.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: stanfordLucyProject.id
      }
    },
    update: {
      roleId: managerRole.id,
      updatedAt: new Date()
    },
    create: {
      userId: museumDirectorUser.id,
      projectId: stanfordLucyProject.id,
      roleId: managerRole.id
    }
  });
  console.log(`  ✓ ${museumDirectorUser.username} assigned as manager of '${stanfordLucyProject.name}' project`);

  // Also create user-project assignments
  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: labHeadUser.id,
        projectId: stanfordBunnyProject.id
      }
    },
    update: {},
    create: {
      userId: labHeadUser.id,
      projectId: stanfordBunnyProject.id
    }
  });

  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: marbleHeadProject.id
      }
    },
    update: {},
    create: {
      userId: museumDirectorUser.id,
      projectId: marbleHeadProject.id
    }
  });

  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: lauranaProject.id
      }
    },
    update: {},
    create: {
      userId: museumDirectorUser.id,
      projectId: lauranaProject.id
    }
  });

  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: museumDirectorUser.id,
        projectId: stanfordLucyProject.id
      }
    },
    update: {},
    create: {
      userId: museumDirectorUser.id,
      projectId: stanfordLucyProject.id
    }
  });

  console.log('✅ Successfully seeded project roles');
}

/**
 * Main seeding function
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting database seeding...');
    
    await seedRoles();
    // Note: Admin user is now created dynamically based on SYS_ADMIN_EMAIL environment variable
    // when the user with that email logs in for the first time
    await seedDemoProjects();
    await seedDemoUsers();
  await seedDemoProjectRoles();
    
    console.log('🎉 Database seeding completed successfully!');
    console.log('ℹ️  Admin user will be created automatically when SYS_ADMIN_EMAIL user logs in');
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