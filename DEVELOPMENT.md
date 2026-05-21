# Development vs Production workflows

This project supports three primary workflows:

- **Development Docker-based (default)**: everything runs in containers — frontend built and served by Nginx, backend compiled,
  local Keycloak included. No hot-reload. Good for full-stack integration testing and matches production behaviour.

- **Development Frontend hot-reload (hybrid)**: Docker handles backend, databases and Keycloak; Vite dev server runs natively
  for instant HMR on every frontend file change. Requires Node.js installed locally.

- **Production**: same Docker stack, without local Keycloak, deployed behind a reverse proxy with strong credentials. (see `DEPLOYMENT_GUIDE.md` for details)



Quick start - Docker-based development
---------------------------------------

1. Ensure Docker and Docker Compose are installed.
2. Start all services — Docker Compose auto-loads `docker-compose.override.yml` (ports, local Keycloak):

   docker compose up --build

Quick start - Frontend hot-reload (hybrid)
------------------------------------------

Start all Docker services as normal and then run the Vite dev server for the frontend:

   docker compose up --build
   cd frontend
   npm run dev

 Open **http://localhost:5173** (instead of :3001).

Changes to any file under `frontend/src/` reload instantly in the browser.
The Vite dev server talks to the Dockerized backend on `:3002` and Keycloak on `:8081`
using the defaults already in `frontend/public/config.js` and `frontend/.env.development` —
no extra configuration needed.

Notes:
- Requires Node.js installed locally. Run `npm install` in `frontend/` the first time.
- If you haven't built the openlime submodule yet (or after changes to it), run:

    cd frontend/openlime && npm install && npm run rollup

  Otherwise Vite will error with "Failed to resolve entry for package openlime".
