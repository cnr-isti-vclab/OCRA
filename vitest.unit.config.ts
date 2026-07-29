import { defineConfig } from 'vitest/config';

/** Pure unit tests that do not require Postgres/Mongo. */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'shared/**/*.test.ts',
      'frontend/src/features/annotation-creation/**/*.test.ts',
      'frontend/src/features/annotation-deletion/**/*.test.ts',
      'frontend/src/features/annotation-link-view/**/*.test.ts',
      'frontend/src/stores/AnnotationStore.creation.test.ts',
      'frontend/src/stores/AnnotationStore.deletion.test.ts',
      'frontend/src/stores/annotation-rendering.test.ts',
      'frontend/src/stores/annotation-selection.test.ts',
      'frontend/src/stores/annotation-social-locks.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'build'],
    reporters: ['verbose'],
  },
});
