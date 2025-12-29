/**
 * Vitest Global Setup
 * Loads .env.test before running tests
 */

import { config } from 'dotenv';
import path from 'path';

export async function setup() {
  // Load .env.test file
  config({ path: path.resolve(__dirname, '../../.env.test') });

  console.log('✅ Loaded .env.test configuration');
  console.log('📊 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');
}
