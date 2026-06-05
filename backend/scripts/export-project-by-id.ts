import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma = new PrismaClient();

function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function parseProjectSelection(raw: string, availableIds: string[]): string | null {
  const value = raw.trim();
  if (!value) return null;

  const numericChoice = Number(value);
  if (Number.isInteger(numericChoice) && numericChoice >= 1 && numericChoice <= availableIds.length) {
    return availableIds[numericChoice - 1] ?? null;
  }

  return availableIds.includes(value) ? value : null;
}

async function main(): Promise<void> {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      public: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (projects.length === 0) {
    console.log('No projects found in PostgreSQL.');
    return;
  }

  console.log('\nAvailable projects:\n');
  projects.forEach((project, idx) => {
    console.log(`${idx + 1}. ${project.id} | ${project.name}`);
  });

  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question('\nSelect a project by number or project id: ');
    const selectedProjectId = parseProjectSelection(
      answer,
      projects.map((p) => p.id)
    );

    if (!selectedProjectId) {
      console.error('Invalid selection.');
      process.exitCode = 1;
      return;
    }

    const projectData = await prisma.project.findUnique({
      where: { id: selectedProjectId },
      include: {
        projectRoles: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                given_name: true,
                family_name: true,
                middle_name: true,
                sub: true,
                sys_admin: true,
                sys_creator: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        structuringLock: true,
        projectPresenceLeases: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                sub: true,
                isActive: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!projectData) {
      console.error(`Project not found: ${selectedProjectId}`);
      process.exitCode = 1;
      return;
    }

    const payload = {
      selectedProjectId,
      exportedAt: new Date().toISOString(),
      projectData,
    };

    console.log('\nProject JSON:\n');
    console.log(JSON.stringify(payload, jsonBigIntReplacer, 2));
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error('Failed to export project data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
