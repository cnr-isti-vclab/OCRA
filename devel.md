Development vs Production workflows
================================

This project supports two primary workflows:

- Development: fast feedback, source bind-mounts, TypeScript runtime (tsx or nodemon), and Vite dev server for frontend.
- Production: build artifacts (frontend `dist/` served by Nginx), compiled backend in `dist/`, and no host source mount.

Quick start - Development
-------------------------

1. Ensure Docker and Docker Compose are installed.
2. Use the development override which mounts source and runs dev servers:

   docker compose -f docker-compose.yml -f docker-compose.override.yml up --build

Notes:
- The development override starts the frontend dev server (Vite) on port `3001` mapped to the container's `3000`.
- The backend service runs from the host-mounted `./backend` directory and uses the `npm run dev` script.

Quick start - Production
------------------------

1. Build production images and run without the override:

   docker compose up --build -d

Notes:
- The frontend Dockerfile builds a production `dist/` and Nginx serves the static files.
- The backend Dockerfile builds the TypeScript project and runs the compiled `dist/` outputs.

Recommended edits for production readiness
-----------------------------------------

- Ensure the production `docker-compose.yml` does NOT mount host source into the backend container. That ensures the container runs the baked `dist/` JS and not the host files.
- Consider updating `start.sh` to choose `node ./dist/server.js` when `NODE_ENV=production` and `npm run dev` or `tsx` when `NODE_ENV=development`.

Troubleshooting
---------------

- If you see stale frontend assets in the browser, clear the browser cache or rebuild the frontend image and restart the containers without the override.
- If the backend appears to be running different code than your edits, confirm whether the backend container is using the host bind mount (development override) or the baked image (production).
