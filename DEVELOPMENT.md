# Development vs Production workflows

This project supports three development workflows plus production:

- **Docker-based development (default)**: the frontend, backend and databases run in containers; authentication
  uses EGI Check-in Demo. No hot-reload. Good for full-stack integration testing.

- **Frontend hot-reload (hybrid)**: Docker handles backend and databases; the Vite dev server runs
  natively for instant HMR on every frontend file change. Requires Node.js installed locally.

- **Bare services (fully local)**: only PostgreSQL and MongoDB run in containers, while backend and frontend
  both run natively via `npm run services:start`.

- **Production**: the same application stack, configured with the production EGI issuer. See
  [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).

Canonical local ports are shared across all workflows:
- frontend: `3001`
- backend: `3002`

Copy `.env.egi-demo.example` to `.env.egi-demo` and set the client secret issued by the Federation Registry.
The destination file is ignored by Git.

Quick start - Docker-based development
---------------------------------------

1. Ensure Docker and Docker Compose are installed.
2. Start all services — Docker Compose auto-loads `docker-compose.override.yml`, which publishes the host ports:

   docker compose --env-file .env.egi-demo up --build

Quick start - Frontend hot-reload (hybrid)
------------------------------------------

The `app` container and the Vite dev server both use port `3001`, so start the backend and its databases, then Vite:

   docker compose --env-file .env.egi-demo up --build backend
   npm run dev:frontend

Open **http://localhost:3001** as usual — the Vite dev server takes the port the `app` container would have used,
which is the redirect URI registered for the EGI Demo client.

Changes to any file under `frontend/src/` reload instantly in the browser.
The Vite dev server talks to the Dockerized backend on `:3002`; authentication goes directly to EGI Check-in
Demo using the public settings in `frontend/public/config.js`.

Notes:
- Requires Node.js installed locally. Run `npm install` at the repo root the first time (npm workspaces).
- Build the viewer submodules once, and again after updating them:

    npm run build:openlime
    npm run build:three-presenter

  Otherwise Vite will error with "Failed to resolve entry for package openlime".

Troubleshooting
---------------

- Stale frontend assets in the browser: clear the browser cache, or rebuild the `app` image and restart it.
- The backend appears to run different code than your edits: confirm whether you are hitting the baked container
  image or the native `tsx watch` process from the hybrid/bare workflow.
