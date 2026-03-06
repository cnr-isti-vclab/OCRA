# Physical Object Import Adapters

This folder contains source-specific import adapters for physical object metadata.

Current adapters:
- `echoes`: fetches SPARQL JSON from ECHOES-compatible endpoints and extracts Dublin Core.
- `wikidata`: pass-through adapter (expects payload-provided metadata).
- `other`: pass-through adapter.
- `arco`: fetches ARCO JSON-LD records and extracts Dublin Core fields.

Use `getPhysicalObjectImportAdapter(sourceType)` to resolve the adapter.
