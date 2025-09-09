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
});
