import { defineConfig } from 'vitest/config';

/** Pure unit tests that do not require Postgres/Mongo. */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'shared/**/*.test.ts',
      'frontend/src/features/annotation-creation/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'build'],
    reporters: ['verbose'],
  },
});
