Development vs Production workflows
================================

This project supports two primary workflows:

- Development: fast feedback, source bind-mounts, TypeScript runtime (tsx or nodemon), and Vite dev server for frontend.
- Production: build artifacts (frontend `dist/` served by Nginx), compiled backend in `dist/`, and no host source mount.

Quick start - Development
-------------------------

1. Ensure Docker and Docker Compose are installed.
2. For hot-reload dev with source mounts (optional, requires `docker-compose.override.yml`):

   docker compose -f docker-compose.yml -f docker-compose.override.yml up --build

   Or run production-style (no override) for faster startup:

   docker compose up --build

Notes:
- With override: frontend Vite dev server on `:3001`, backend uses `npm run dev` with source mounts.
- Without override: production builds, but still suitable for basic dev testing.

Quick start - Production
------------------------

1. Build production images and run (default behavior):

   docker compose up --build -d

Notes:
- Frontend serves built `dist/` via Nginx; backend runs compiled TypeScript from `dist/`.
- No host source mounts for security and performance.

Recommended edits for production readiness
-----------------------------------------

- The `start.sh` script already chooses `node ./dist/server.js` for production (`NODE_ENV=production`) and dev commands otherwise.
- Ensure production `docker-compose.yml` has no host source mounts (currently correct).

Troubleshooting
---------------

- If you see stale frontend assets in the browser, clear the browser cache or rebuild the frontend image and restart the containers without the override.
- If the backend appears to be running different code than your edits, confirm whether the backend container is using the host bind mount (development override) or the baked image (production).
- MongoDB 8.0 requires fresh data volumes; if starting fails, remove volumes with `docker compose down -v`.
