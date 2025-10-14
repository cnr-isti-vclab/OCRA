import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite configuration for building ThreePresenter as a standalone library
 * 
 * This creates distributable bundles that can be used:
 * - UMD: For <script> tags in HTML
 * - ES: For modern ES module imports
 * - IIFE: For immediate invocation in browsers
 * 
 * Build command: npm run build:standalone
 */
export default defineConfig({
  build: {
    outDir: 'dist-standalone',
    lib: {
      entry: resolve(__dirname, 'src/components/ThreePresenter.ts'),
      name: 'OcraThreePresenter',
      fileName: (format) => `three-presenter.${format}.js`,
      formats: ['umd', 'es', 'iife']
    },
    rollupOptions: {
      // Externalize Three.js - users should load it from CDN
      external: ['three', /^three\//],
      output: {
        // Global variable names for UMD/IIFE builds
        globals: {
          three: 'THREE'
        },
        // Export all public APIs
        exports: 'named'
      }
    },
    // Generate source maps for debugging
    sourcemap: true
  },
  resolve: {
    alias: {
      // Resolve shared types
      '@shared': resolve(__dirname, '../shared')
    }
  },
  // Ensure TypeScript types are generated
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
});
