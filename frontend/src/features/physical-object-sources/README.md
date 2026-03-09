# Physical Object Sources (Frontend)

Each source adapter is isolated and defines four extension points:

- import form component: asks source-specific user input
- import request builder: creates payload for backend source import endpoint
- read-only metadata renderer: presents imported HC1 metadata without editing
- ontology mapper: maps cached metadata to HC1-oriented triples

Add a new source by implementing a `PhysicalObjectSourceAdapter` and registering it in `registry.ts`.
