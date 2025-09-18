# OCRA
**OCRA** stands for **O**nline **C**onservation-**R**estoration **A**nnotator.

OCRA is a minimal open-source platform for collaborative annotation and management of 3D assets, designed for conservation-restoration and heritage science workflows. It enables users to set up projects, define hierarchical roles, and organize 3D-centric data and annotations in a web-based environment. The platform supports direct spatial annotation on high-resolution 3D models, semantic mapping of annotations, and project-specific task management. Advanced tools allow users to trace, map, and export metric 3D annotations for interoperability and analysis. OCRA emphasizes simplicity, transparency, and ease of deployment for research and cultural heritage institutions.

## Framework Overview

OCRA is built with a modern full-stack architecture:
- **Frontend:** React + TypeScript, styled with Bootstrap for a clean, responsive UI.
- **Backend:** Node.js (Express) with Prisma ORM and PostgreSQL for robust data management.
- **Authentication:** OAuth2 PKCE (Keycloak) for secure, standards-based login and role management.
- **Containerization:** Docker and Docker Compose for easy deployment and reproducibility.

### High-Level Techniques
- Role-based access control (RBAC) for users and projects
- RESTful API endpoints for all core operations
- Audit logging for key actions
- Minimal, maintainable codebase with clear separation of concerns


## Development

To run and test OCRA locally:

1. **Clone the repository:**
   ```sh
   git clone <repo-url>
   cd OCRA
   ```
2. **Start the app with Docker Compose:**
   ```sh
   docker compose up --build -d app
   ```
   This will build and start both backend and frontend containers.

3. **Access the app:**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3002

4. **Run tests:**
   (Add test instructions here if available)

For development without Docker, see the `README.dev.md` (if present) or inspect the `package.json` scripts in the frontend and backend folders.

