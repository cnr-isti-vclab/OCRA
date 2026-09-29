# Development vs Production workflows

This project supports three development workflows plus production:

- **Docker-based development (default)**: everything runs in containers — frontend built and served by Nginx,
  backend compiled, local Keycloak included. No hot-reload. Good for full-stack integration testing and matches
  production behaviour.

- **Frontend hot-reload (hybrid)**: Docker handles backend, databases and Keycloak; the Vite dev server runs
  natively for instant HMR on every frontend file change. Requires Node.js installed locally.

- **Bare services (fully local)**: only PostgreSQL, MongoDB and Keycloak run in containers, while backend and
  frontend both run natively via `npm run services:start`. See [`doc/local-dev-setup.md`](doc/local-dev-setup.md).

- **Production**: same Docker stack, without local Keycloak, deployed behind a reverse proxy with strong
  credentials. See [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).

Canonical local ports are shared across all workflows:
- frontend: `3001`
- backend: `3002`
- Keycloak: `8081`

Quick start - Docker-based development
---------------------------------------

1. Ensure Docker and Docker Compose are installed.
2. Start all services — Docker Compose auto-loads `docker-compose.override.yml`, which publishes the host ports
   and adds the local Keycloak:

   docker compose up --build

Note: Keycloak is defined **only** in the override, so plain `docker compose -f docker-compose.yml up` starts a
stack with no identity provider and the backend will not become ready.

Quick start - Frontend hot-reload (hybrid)
------------------------------------------

The `app` container and the Vite dev server both use port `3001`, so start every service **except** `app`:

   docker compose up --build keycloak backend
   npm run dev:frontend

Open **http://localhost:3001** as usual — the Vite dev server takes the port the `app` container would have used,
which is also the redirect URI registered in Keycloak.

Changes to any file under `frontend/src/` reload instantly in the browser.
The Vite dev server talks to the Dockerized backend on `:3002` and Keycloak on `:8081`
using the defaults already in `frontend/public/config.js` and `frontend/.env.development` —
no extra configuration needed.

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
