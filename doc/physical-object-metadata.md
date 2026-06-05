# Physical Object Metadata Model

This document defines the HC1 physical object metadata model and links to the implementation in OCRA.

## Scope

- Stored in MongoDB as `physicalObjectMetadata` inside the HDT document.
- Represents HC1-level metadata for the physical object.
- Imported from known sources and shown as read-only in the frontend.

See also `doc/data-model.md` for the global model.

## Canonical Shape

`physicalObjectMetadata` is source-oriented and extensible.

```json
{
	"sourceUri": "https://example.org/resource/...",
	"sourceType": "echoes",
	"dublinCore": {
		"title": "...",
		"description": "...",
		"creator": "...",
		"date": "..."
	},
	"cidocCrm": {},
	"sourceRecord": {
		"importedAt": "..."
	}
}
```

Required fields:
- `sourceUri`
- `sourceType`

Supported persisted `sourceType` values in backend/shared contracts:
- `echoes`
- `arco`
- `wikidata`
- `other` (backend-level fallback)

Notes:
- Frontend source adapters include `file` as a UI source type.
- The `file` adapter maps to backend import request `sourceType: other` and stores metadata in the same `physicalObjectMetadata` structure.

## Runtime Behavior

- When a project is created, it starts with no imported HC1 metadata.
- When a project has no imported HC1 metadata, this is evident in the GUI and the user can choose a source and provide source-specific input (for example ECHOES dataset parameters, ARCO catalog ID, or Wikidata/Reasonator QID URL).
- Backend imports/transforms source data into `physicalObjectMetadata`.
- Frontend renders imported data in read-only mode.
- Source-specific ontology mapping preview is generated in frontend adapter code.

## Implementation Links

### Backend

- Type contract:
	[`backend/src/types/index.ts`](../backend/src/types/index.ts)
- Normalization/default helpers:
	[`backend/src/services/physical-object-import/normalize.ts`](../backend/src/services/physical-object-import/normalize.ts)
- Adapter interface:
	[`backend/src/services/physical-object-import/adapter.interface.ts`](../backend/src/services/physical-object-import/adapter.interface.ts)
- Adapter registry:
	[`backend/src/services/physical-object-import/index.ts`](../backend/src/services/physical-object-import/index.ts)
- ECHOES adapter:
	[`backend/src/services/physical-object-import/echoes.adapter.ts`](../backend/src/services/physical-object-import/echoes.adapter.ts)

- ARCO adapter:
	[`backend/src/services/physical-object-import/arco.adapter.ts`](../backend/src/services/physical-object-import/arco.adapter.ts)
- Wikidata adapter:
	[`backend/src/services/physical-object-import/wikidata.adapter.ts`](../backend/src/services/physical-object-import/wikidata.adapter.ts)
- Import endpoint handler:
	[`backend/src/controllers/hdt-metadata.controller.ts`](../backend/src/controllers/hdt-metadata.controller.ts)
- Import endpoint route:
	[`backend/src/routes/hdt-metadata.routes.ts`](../backend/src/routes/hdt-metadata.routes.ts)
- HDT persistence/update service:
	[`backend/src/services/hdt-metadata.service.ts`](../backend/src/services/hdt-metadata.service.ts)

### Frontend

- Source adapter contract:
	[`frontend/src/features/physical-object-sources/types.ts`](../frontend/src/features/physical-object-sources/types.ts)
- Source registry:
	[`frontend/src/features/physical-object-sources/registry.tsx`](../frontend/src/features/physical-object-sources/registry.tsx)
- ECHOES source adapter (form + request builder + read-only view + HC1 mapping):
	[`frontend/src/features/physical-object-sources/echoes.tsx`](../frontend/src/features/physical-object-sources/echoes.tsx)

- ARCO source adapter:
	[`frontend/src/features/physical-object-sources/arco.tsx`](../frontend/src/features/physical-object-sources/arco.tsx)
- Wikidata source adapter:
	[`frontend/src/features/physical-object-sources/wikidata.tsx`](../frontend/src/features/physical-object-sources/wikidata.tsx)
- File (RDF) source adapter:
	[`frontend/src/features/physical-object-sources/file.tsx`](../frontend/src/features/physical-object-sources/file.tsx)
- Import UI integration:
	[`frontend/src/routes/EditProject.tsx`](../frontend/src/routes/EditProject.tsx)

## Source Adapter Pattern

Each source adapter is expected to provide:

1. Input form for source-specific parameters.
2. Function to build/import data request.
3. Read-only metadata renderer.
4. Function to map source metadata to HC1 ontology triples.

This keeps source logic isolated and allows adding new sources without touching unrelated HC2/scenes code.

## Current Source Status

- ECHOES: implemented.
- ARCO: implemented.
- Wikidata: implemented (Reasonator-compatible QID resolution).
- File (RDF): implemented (frontend adapter, persisted as backend `sourceType: other`).

## ARCO Samples

Sample payloads for ARCO (for adapter development and tests) should be kept in:
- `doc/metadata-sample/`

Reference endpoint example:
- `https://dati.cultura.gov.it/lodview-arco/resource/HistoricOrArtisticProperty/0901078520.html?output=application%2Fld%2Bjson`

---

*Last reviewed: 2026-05-20*
