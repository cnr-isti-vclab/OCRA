# Development vs Production workflows

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
