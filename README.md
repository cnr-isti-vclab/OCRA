# OCRA

![Backend Tests](https://github.com/cnr-isti-vclab/OCRA/workflows/Backend%20Tests/badge.svg)
[![Annotation Schema Checks](https://github.com/cnr-isti-vclab/OCRA/actions/workflows/annotation-schema.yml/badge.svg)](https://github.com/cnr-isti-vclab/OCRA/actions/workflows/annotation-schema.yml)

OCRA (Online Conservation-Restoration Annotator) is a collaborative full-stack platform for the structured documentation, analysis, and semantic enrichment of two- and three-dimensional representations of tangible cultural heritage assets. It supports 3D mesh representations, 2D images, and relightable/RTI models.

OCRA is developed by the [Visual Computing Lab, ISTI-CNR](https://vcg.isti.cnr.it/) as a Vertical Application of the [ECHOES project](https://www.echoes-eccch.eu/) and is designed to interoperate with the European Collaborative Cloud for Cultural Heritage (ECCCH). It combines collaborative annotation, semantic enrichment, and publication of Heritage Digital Twin data to ECCCH.

## Release Status

OCRA is under active development. The current codebase is a pre-release research platform: its architecture, workflows, APIs, and data models may evolve as development and validation activities within ECHOES continue.

## Project Repositories and Website

- Active development repository: [cnr-isti-vclab/OCRA](https://github.com/cnr-isti-vclab/OCRA)
- Github pages: [cnr-isti-vclab.github.io/OCRA](https://cnr-isti-vclab.github.io/OCRA/)
- Official ECHOES GitHub organization: [ECHOES-ECCCH](https://github.com/orgs/ECHOES-ECCCH/)

Stable OCRA releases, tags, documentation, and release notes are intended to be made visible through the ECHOES GitHub organization in accordance with the ECHOES Git Repository Management Policy.

## Architecture

- Frontend: React + TypeScript (Vite), Bootstrap UI — dev server on `:3001`.
- Backend: Node.js + Express; Prisma + PostgreSQL for application data (users, sessions, projects) — API on `:3002`.
- Audit store: **MongoDB 7.0** (audit events including login/logout/file uploads stored in Mongo collection). Backend uses Prisma only to enrich audit documents with user info (read-only).
- Authentication: OAuth2 PKCE (Keycloak). Realm exports under `keycloak/realm-export/`.

## Quick Start

1. Clone and enter the repository:

   ```bash
   git clone https://github.com/cnr-isti-vclab/OCRA.git
   cd OCRA
   ```

2. Start services with Docker Compose:

   ```bash
   docker compose up --build -d app
   ```

3. Open the application:

   - Frontend: `http://localhost:3001`
   - Backend API: `http://localhost:3002`

Notes:

- Audit logs (login/logout/file uploads) are stored in MongoDB; all authenticated users can view audit events (filtered by permissions).
- If you change the Prisma schema, run `npx prisma generate` in `backend/` to regenerate the client.
- For local development without Docker, use the `frontend` and `backend` package.json scripts directly.
- For production deployment, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Documentation

- [Technical documentation index](doc/README.md)
- [Architecture](doc/architecture.md)
- [Workflows](doc/workflow.md)
- [Local development setup](doc/local-dev-setup.md)
- [Deployment guide](DEPLOYMENT_GUIDE.md)

## Related Source Code

- OCRA: [cnr-isti-vclab/OCRA](https://github.com/cnr-isti-vclab/OCRA)
- ThreePresenter: [cnr-isti-vclab/ThreePresenter](https://github.com/cnr-isti-vclab/ThreePresenter) — 3D viewer.
- OpenLIME: [cnr-isti-vclab/openlime](https://github.com/cnr-isti-vclab/openlime/tree/ocra-integration) (`ocra-integration` branch) — 2D and RTI viewer.

## Maintainers

- [Visual Computing Lab, ISTI-CNR](https://vcg.isti.cnr.it/)
- [Visual and data-intensive computing, CRS4](https://www.crs4.it/en/research-and-development-sectors/vidic/)

## License

OCRA is released under the [MIT License](LICENSE).

## Funding Acknowledgement

This work has been developed in the context of the ECHOES project — European Cloud for Heritage OpEn Science, funded by the European Union under Grant Agreement No. 101157364, with the support of UK Research and Innovation (UKRI) under the UK Government’s Horizon Europe funding guarantee No. 10110142 and No. 10110466.

Views and opinions expressed are those of the author(s) only and do not necessarily reflect those of the European Union or the granting authority. Neither the European Union nor the granting authority can be held responsible for them.
