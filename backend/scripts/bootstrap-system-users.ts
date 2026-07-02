import 'dotenv/config';

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

type BootstrapUserEntry = {
  email: string;
  sub?: string;
  username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  sys_admin?: boolean;
  sys_creator?: boolean;
};

const prisma = new PrismaClient();
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_CONFIG_PATH = path.join(BACKEND_DIR, 'config', 'system-users.json');

function resolveConfigPath(): string {
  const cliPath = process.argv[2]?.trim();
  if (cliPath) {
    return path.resolve(process.cwd(), cliPath);
  }

  const envPath = process.env.SYSTEM_USERS_BOOTSTRAP_FILE?.trim();
  if (envPath) {
    return path.resolve(process.cwd(), envPath);
  }

  return DEFAULT_CONFIG_PATH;
}

function assertValidEntry(entry: BootstrapUserEntry, index: number): asserts entry is BootstrapUserEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid user entry at index ${index}: expected object.`);
  }

  if (!entry.email || typeof entry.email !== 'string') {
    throw new Error(`Invalid user entry at index ${index}: "email" is required.`);
  }
}

async function loadEntries(configPath: string): Promise<BootstrapUserEntry[]> {
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Bootstrap file must contain a JSON array.');
  }

  parsed.forEach((entry, index) => assertValidEntry(entry as BootstrapUserEntry, index));
  return parsed as BootstrapUserEntry[];
}

async function upsertBootstrapUser(entry: BootstrapUserEntry) {
  const normalizedEmail = entry.email.trim().toLowerCase();
  const providedSub = entry.sub?.trim();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        ...(providedSub ? [{ sub: providedSub }] : []),
      ],
    },
  });

  const data = {
    email: normalizedEmail,
    username: entry.username?.trim() || null,
    name: entry.name?.trim() || null,
    given_name: entry.given_name?.trim() || null,
    family_name: entry.family_name?.trim() || null,
    middle_name: entry.middle_name?.trim() || null,
    sys_admin: entry.sys_admin === true,
    sys_creator: entry.sys_creator === true,
  };

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(providedSub && existing.sub.startsWith('pending:') ? { sub: providedSub } : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      sub: providedSub || `pending:${randomUUID()}`,
      ...data,
    },
  });
}

async function main() {
  const configPath = resolveConfigPath();

  try {
    await fs.access(configPath);
  } catch {
    console.log(`ℹ️  System user bootstrap skipped: file not found at ${configPath}`);
    return;
  }

  console.log(`👥 Bootstrapping system users from ${configPath}...`);
  const entries = await loadEntries(configPath);

  for (const entry of entries) {
    const user = await upsertBootstrapUser(entry);
    console.log(
      `  ✓ ${user.email} (creator=${user.sys_creator ? 'yes' : 'no'}, admin=${user.sys_admin ? 'yes' : 'no'}, sub=${user.sub})`
    );
  }

  console.log(`✅ System user bootstrap completed (${entries.length} entries).`);
}

main()
  .catch((error) => {
    console.error('❌ System user bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
