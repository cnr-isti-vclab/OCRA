# OCRA Documentation

This page is the index for technical documentation in `doc/`.

## Canonical

- [Data Model (Canonical)](./data-model.md)
- [Architecture](./architecture.md)
- [Workflow](./workflow.md)

## Core Technical Guides

- [Local Development Setup](./local-dev-setup.md)
- [Scene JSON Format](./scene-json-format.md)
- [RTI Asset Ontology and Upload Pipeline](./rti-asset-ontology-and-upload-pipeline.md)

## Domain and Use Cases

- [OCRA Use Case](./ocra-use-case.md)
- [00 Annotation Model](./00-annotation-model.md)
- [01 Collaborative Annotation Editing](./collaborative-annotation-editing.md)
- [02 Annotation API](./annotation-api.md)

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
