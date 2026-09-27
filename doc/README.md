# OCRA Documentation

This page is the index for technical documentation in `doc/`.

## Canonical

- [Data Model (Canonical)](./data-model.md)
- [Architecture](./architecture.md)
- [Workflow](./workflow.md)

## Core Technical Guides

- [Development Workflows](../DEVELOPMENT.md)
- [Local Development Setup (bare services)](./local-dev-setup.md)
- [Frontend OpenLIME Integration](./frontend-openlime.md)
- [Physical Object Metadata](./physical-object-metadata.md)
- [Vocabulary and Terminology](./vocabulary.md)
- [Reference Frames](./reference-frames.md)

## Domain and Use Cases

- [OCRA Use Case](./ocra-use-case.md)
- [Roles and Access Control](./roles-and-access-control.md)

### Annotation Model

- [a00 Annotation Model](./a00-annotation-model.md)
- [a01 Collaborative Annotation Editing](./a01-collaborative-annotation-editing.md)
- [a02 Annotation API](./a02-annotation-api.md)
- [a03 Annotation Integration](./a03-annotation-integration.md)
- [a04 Structuring Lock and Project Presence](./a04-structuring-lock.md)
- [a05 Frontend Annotation API Client](./a05-frontend-annotation-api-client.md)
- [a06 Active Annotations](./a06-active-annotations.md)
- [Annotation Current Status](./annotation-current-status.md)

## Archived / Outdated

Non-essential or superseded docs are kept in:
- [`doc/outdated_docs/`](./outdated_docs)

## Documentation Rules

1. Keep links valid.
2. Keep role names and data entities aligned with `backend/prisma/schema.prisma`.
3. Keep API route references aligned with `backend/src/routes/`.
4. Keep storage/path references aligned with:
   - `backend/src/services/hdt-metadata.service.ts`
   - `backend/src/utils/project-static-paths.ts`
   - `backend/src/app.ts`

## REST API documentation
The REST API is documented via OpenAPI, which can be accessed at `http://localhost:3002/api-docs` when the backend is running locally.

---

*Last reviewed: 2026-09-08*
