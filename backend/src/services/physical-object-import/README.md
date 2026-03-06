# Physical Object Import Adapters

This folder contains source-specific import adapters for physical object metadata.

Current adapters:
- `echoes`: fetches SPARQL JSON from ECHOES-compatible endpoints and extracts Dublin Core.
- `wikidata`: pass-through adapter (expects payload-provided metadata).
- `other`: pass-through adapter.
- `arco`: stub adapter (intentionally not implemented yet).

Use `getPhysicalObjectImportAdapter(sourceType)` to resolve the adapter.
