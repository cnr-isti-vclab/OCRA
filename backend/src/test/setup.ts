/**
 * Vitest Global Setup
 * Loads .env.test before running tests
 */

import { config } from 'dotenv';
import { execFileSync } from 'child_process';
import path from 'path';

export async function setup() {
  const backendRoot = path.resolve(__dirname, '../..');

  // Load .env.test file
  config({ path: path.resolve(backendRoot, '.env.test') });

  console.log('✅ Loaded .env.test configuration');
  console.log('📊 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');

  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
  });

  console.log('✅ Test database migrations applied');
}
