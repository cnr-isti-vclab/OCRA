# Vocabulary and Terminology in OCRA

## Status

This document defines the **target design** for controlled vocabularies in OCRA and records the
decisions taken on 2026-09-08.

The current implementation diverges from it substantially: there are two unconnected vocabulary
mechanisms, and neither is reachable from an annotation. See [Current state](#current-state).
Until this design is implemented, treat `doc/data-model.md` §`Vocabulary` as a description of one
half of the existing code, not as the intended model.

---

## Purpose

An annotation in OCRA carries two things: a spatial anchor and semantic content. The vocabulary
exists to make the *semantic* half comparable across annotations, projects and institutions — so
that "this area shows detachment" means the same thing when a conservator in one project writes it
as when a researcher in another reads it, and so that annotations remain interpretable once
published as Heritage Digital Twin data.

Free-text labels cannot do this. A conservation-restoration campaign needs terms drawn from a
shared reference — an *abaco dei degradi*, a materials thesaurus, a diagnostic taxonomy — with
stable identity, so annotations can be aggregated, filtered and queried by concept rather than by
spelling.

## Division of responsibility

The governing decision is that **OCRA is not a vocabulary authority**. ECCCH is.

| Concern | Owner | Rationale |
| --- | --- | --- |
| Term meaning, definition, hierarchy | **ECCCH / KBMS** | FORTH is the semantic authority for the knowledge base OCRA publishes into. Terms defined locally would be a second, divergent reading of the same domain. |
| Term identity (the URI) | **ECCCH**, where the term exists there | A term's URI is what makes annotations comparable outside OCRA. |
| *Which* terms a project uses | **OCRA**, per project | Term selection is a curatorial act specific to a campaign. A numismatics project has no use for a fresco degradation thesaurus. |
| Display presentation (colour, ordering) | **OCRA** | Presentation is a UI concern; ECCCH SKOS carries no colour. |
| Terms not yet in ECCCH | **OCRA**, provisionally | Fieldwork outruns the knowledge base. Project-local terms are an escape hatch, not a parallel vocabulary. |

## Decisions

| # | Decision | Consequence |
| --- | --- | --- |
| V1 | **Terms are pulled from ECCCH / HDTO.** OCRA holds no canonical term definitions. | The shipped-TTL vocabulary becomes a seed or a cache, not a source of truth. |
| V2 | **Annotations reference terms as full URIs in the open `content` payload.** No typed field, no write-time validation. | Maximum flexibility and zero schema change; term usage is not indexed by default (see [Accepted consequences](#accepted-consequences)). |
| V3 | **Scope is global-shared plus project-local.** Projects draw on shared vocabularies and may define their own terms. | Requires an ownership rule for project-local terms and a path for promoting them upstream. |
| V4 | **Project managers curate their project's terms.** Terms should nevertheless be kept on ECCCH, where most needed terms already exist. | Authoring in OCRA is the exception; the normal act is *finding and selecting* an existing ECCCH term. |

V4 is the one most likely to be misread. It does not mean managers author terminology in OCRA. It
means the manager decides which terms their project works with, and when a required term is absent
from ECCCH, the manager may record it locally *pending* its addition upstream.

## Current state

Two mechanisms exist. The documentation describes only the first, and the second holds all of the
actual semantic content.

**1. The registry — `Vocabulary` (PostgreSQL).** Four meaningful fields: `name`, `description`,
`public`. Full CRUD across five routes in `backend/src/routes/vocabularies.routes.ts`. It contains
**no terms at all** — it names vocabularies whose contents it does not hold.

**2. The term store — `backend/src/lib/vocabulary-loader.ts`.** Reads
`media/RDF/ocra-vocabulary-extended.ttl` from disk with N3 at startup and builds genuine SKOS
structure: concepts with `prefLabel`, `scopeNote`, `broader`, `inScheme`, plus per-concept colours
and properties. Served at `GET /api/vocabulary/concepts`, rendered by `TtlVocabularyWidget`. Both
the module and the widget are marked `@spike`.

The two never reference each other. Neither is reachable from an annotation: there are **no**
references to concept CURIEs anywhere in `backend/src/repositories`, `backend/src/services` or
`shared/`, and `doc/a00-annotation-model.md` describes the annotation `class` field as free text
where "a controlled vocabulary *may* be enforced at application level" — it is not.

### Documentation drift to reconcile

Three documents give three different answers for anonymous read access to vocabularies, and two of
them claim to be canonical for policy decisions:

| Source | Anonymous access |
| --- | --- |
| `doc/data-model.md` §6.4 | Public vocabularies only |
| `doc/roles-and-access-control.md` §6.3 | Unrestricted |
| `doc/architecture.md` | Authenticated only |

The `public` flag on the `Vocabulary` model supports the first reading. This needs one decision
recorded in `doc/roles-and-access-control.md`, which is canonical for access control; the other two
should then be corrected to match.

## Target model

- **Term identity** is the ECCCH URI. OCRA stores and compares URIs, never labels.
- **A project's vocabulary** is a curated set of term references — global schemes the project has
  adopted, plus any project-local terms. This is what the `Vocabulary` registry becomes: a record of
  *adoption*, not of content.
- **Labels are resolved, not stored.** `prefLabel` and `scopeNote` come from ECCCH at read time and
  are cached; a stale cached label is a display issue, never a data-integrity one.
- **Colour is an OCRA overlay** keyed by term URI. This is the one piece of the existing spike with
  no home in ECCCH, and the reason the spike cannot simply be deleted.
- **Annotations** carry term URIs in `annotation_data.content` (V2).

### Retrieval needs no new transport

Two mechanisms for querying ECCCH already exist and are sufficient to retrieve SKOS concepts:

- `runFederatedQuery` (`backend/src/services/echoes-kb.service.ts`) — `POST
  /repository/inParallelQuery` fanned out across the configured triple stores, with an ECCCH bearer.
- `POST /api/projects/sparql-proxy` (`backend/src/routes/hdt-metadata.routes.ts`) — an
  authenticated proxy to arbitrary SPARQL endpoints, used to avoid browser CORS.

A SKOS concept query is an ordinary `SELECT`. No new client, endpoint or dependency is required,
and none should be added.

> Note: the ECHOES Common Platform API PoC (2026-09) defines **no** vocabulary or terminology
> endpoint. Until it does, ECCCH terms are reachable only over SPARQL, which is also why V1 does not
> depend on the Common Platform migration.

## Accepted consequences

V2 trades enforcement for flexibility. The consequences are accepted, not overlooked:

- **No write-time validation.** An annotation may reference a URI that does not resolve. Detection
  is a read-time or batch concern, not a write-time rejection.
- **Term usage is not indexed.** "Which annotations use this term?" requires scanning
  `annotation_data`. If that query becomes routine, the cheap remedy is a sparse MongoDB index on
  the specific `content` path holding term URIs — not a schema migration.
- **No referential integrity on removal.** Removing a term from a project's selection does not
  invalidate annotations already referencing it, which is the desired behaviour: published
  annotations must remain interpretable.

## Resolving the `vocabulary-color` spike

`TtlVocabularyWidget.tsx` carries a four-step removal plan. That plan assumes the database has taken
over the SKOS content and would, followed as written, **discard the concept hierarchy and colours**
with nothing in place of them. Under this design the sequence is different:

1. Point concept retrieval at ECCCH over the existing SPARQL path, replacing the TTL file as the
   source of concepts.
2. Keep colour as an OCRA-owned overlay keyed by term URI, and migrate the colours currently
   embedded in `ocra-vocabulary-extended.ttl` into it.
3. Repurpose the `Vocabulary` registry as the project's record of adopted schemes and local terms.
4. Only then remove `vocabulary-loader.ts` and `vocabulary-concepts.routes.ts`. `TtlVocabularyWidget`
   is replaced rather than deleted — the vocabulary tree remains the manager's selection surface.

`media/RDF/ocra-vocabulary-extended.ttl` is retained as the provenance record of the local terms,
and as the input for promoting them into ECCCH.

## Open questions

1. **Which ECCCH schemes?** The concrete scheme URIs a project should be able to adopt are not yet
   identified. Needed before implementation.
2. **How do project-local terms reach ECCCH?** V4 says terms "should be kept on ECCCH". The
   mechanism — manual curation, a submission flow, or publication alongside HDT enrichment — is
   undecided.
3. **What URI do project-local terms get?** Minting them under an OCRA namespace makes them
   citable but creates identifiers that must later be reconciled with their ECCCH counterparts.
4. **Anonymous read access** — see [Documentation drift](#documentation-drift-to-reconcile).
5. **Is `Vocabulary.public` still meaningful** once a vocabulary is a project-scoped adoption record
   rather than a global object?

---

*Last reviewed: 2026-09-08*
