# Physical Object Import Adapters

This folder contains source-specific import adapters for physical object metadata.

Current adapters:
- `echoes`: fetches SPARQL JSON from ECCCH-compatible endpoints and extracts Dublin Core.
- `wikidata`: resolves QID from Wikidata/Reasonator URLs and imports Dublin Core from Wikidata EntityData.
- `europeana`: imports Dublin Core fields from a Europeana 3D record selected through the Europeana browser.
- `other`: pass-through adapter.
- `arco`: fetches ARCO JSON-LD records and extracts Dublin Core fields.

Use `getPhysicalObjectImportAdapter(sourceType)` to resolve the adapter.
