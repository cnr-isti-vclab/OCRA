import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Usa 'node' per test backend (no browser APIs)
    environment: 'node',
    
    // Global setup to load .env.test
    globalSetup: './src/test/setup.ts',
    
    // Set NODE_ENV to test
    env: {
      NODE_ENV: 'test',
    },
    
    // Run tests SEQUENTIALLY to avoid database conflicts
    // Integration tests share the same database, so parallel execution causes issues
    pool: 'forks',
    singleFork: true, // All tests run in one process, one after another
    fileParallelism: false,
    
    // Pattern per trovare i test
    include: ['**/*.{test,spec}.{js,ts}'],
    
    // Escludi cartelle comuni
    exclude: ['node_modules', 'dist', 'build', 'media'],
    
    // Timeout per test lenti (es. DB)
    testTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        'scripts/**',
        'seed.ts',
        'prisma/**',
      ],
      // Target minimo (opzionale)
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
    
    // Mock automatici
    mockReset: true,
    restoreMocks: true,
    
    // Output più leggibile
    reporters: ['verbose'],
  },
  
  resolve: {
    alias: {
      // Supporto per path aliases se usi @/
      '@': path.resolve(__dirname, './src'),
    },
  },
});
