/**
 * Vite config for the React OAuth2 PKCE demo.
 * - Dev server runs on 5173 for local development.
 * - Preview runs on 3001 to align with Docker mapping.
 * Uses VITE_* env variables from .env during `npm run dev`.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  preview: {
   port: 3001,
    host: true
  }
  ,
  build: {
    // Increase the warning threshold and split Three.js core vs examples/loaders
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('three/examples')) return 'three-examples';
            if (id.includes('three')) return 'three-core';
            if (id.includes('react')) return 'react-vendor';
            if (id.includes('bootstrap')) return 'bootstrap-vendor';
            // put other node_modules into a general vendor chunk
            return 'vendor';
          }
        }
      }
    }
  }
});
