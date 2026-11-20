# ECCCH Personal Space Integration

## Status

Design for the next implementation phase, not implemented. It targets the ECHOES Cloud Platform API 0.16.0 (experimental), the User Personal Space model of D6.3, and the flow demonstrated by VTL in D16.1: import from the Personal Space, register an HDT, enrich it with REFERENCED and MANAGED assets. VTL's code is the reference client: [`echoesPlatformClient.js`](https://github.com/ECHOES-ECCCH/Vertical-Application-VTL/blob/master/portal-ui/src/custom/services/echoes/echoesPlatformClient.js) for the calls and payloads, [`EchoesPlatformRepository.java`](https://github.com/ECHOES-ECCCH/Vertical-Application-VTL/blob/master/portal-bl/src/main/java/pl/psnc/vtl/portal/repositories/echoes/EchoesPlatformRepository.java) for server-side import.

---

## Model

- **One OCRA project ↔ one HDT, stored in the owner's Personal Space** (`/spaces/me`). The HDT is registered with the physical object's URI as `heritageEntityUri` and the OCRA project URL as `projectUri`, and found again with `GET /hdts?scope=MINE&search=<heritageEntityUri>`. Each project has a single owner (D4); only the owner's token writes to the platform, so the HDT and all its assets belong to one identity. A Personal Space may hold several projects, since assets and enrichments are addressed individually.
- **Any user's Personal Space** is also an import source for that user's own assets.
- **Mongo stays the working store.** Annotation editing, OCC and SSE are unchanged; only explicit import, save and publish actions call the platform.
- **Identity:** OCRA forwards the user's EGI Check-in access token to the platform, which validates it by introspection and handles KBMS authentication; VTL works the same way with its own Check-in client. Users stay keyed on `sub` (`voperson_id`), never on email.
- **Binaries live in the platform.** Every binary (3D models, RTI, images, including those first imported from a third-party URL) is uploaded as a MANAGED asset to the owner's Personal Space. The HDT records its `canonicalUri` (`https://id.culturalheritagecloud.eu/assets/<uuid>`), and its platform content route becomes the asset's `metadata.sourceUrl`. A project saved in the KB can therefore be opened by any OCRA instance, even when the instance that created it no longer exists.
- **`project_files/` is a working copy.** The platform keeps each asset's package as uploaded; the formats the viewers use are derived from it locally and never uploaded. Opening a KB project in another instance uses the existing ECHOES import: each package is downloaded from its `sourceUrl`, now with the user's EGI token, and ingested locally. The working copy must therefore be rebuildable from the package and the HDT metadata alone.
- **Assets and annotations are attached by enrichment.** The registered mapping `https://culturalheritagecloud.eu/mappings/hdto-digital-object/0.1` links any asset to the HDT as `HP29_has_digital_object_part`, with a free `enrichmentType` label. OCRA uses it for every binary and for the project snapshot, so annotations reach the KB as a file with no new RDF code. Annotations as queryable statements need their own payload (Q5, Q8). An enrichment changes the HDT as soon as its operation succeeds, so saving to the platform is publishing: only the owner does it, and editors work in OCRA until then.
- **Platform writes are asynchronous.** OCRA stores each returned operation id with the project, polls it while the owner's session is valid, and shows pending, failed and reconciliation-required states; an operation still pending when the session ends is polled again at the owner's next login, since the platform has no delegated token for long-running work yet.
- **No deletion.** Platform assets can only be archived; archived assets keep their quota and HDT links. OCRA never offers to delete what it saved.

---

## Steps

Application paths are under `/platform/v1` (`/api/v1` is the platform's internal prefix). Writes send an `Idempotency-Key` derived from the request content (e.g. `hdtId` + SHA-256), so a retry reuses it. Each enrichment is checked afterwards with a SPARQL query on `HP29` through `POST /semantic-queries`.

| Step | Scope | Endpoints | Blocked by |
|---|---|---|---|
| 1 | Import from the Personal Space into a project: MANAGED content with the user's token, REFERENCED content from its `externalUri` | `GET /spaces/me/assets`, `GET /assets/{id}`, `GET /assets/{id}/content` | Q1, Q2 |
| 2 | Upload project binaries as MANAGED assets | `POST /spaces/me/assets/uploads` (name, type, size, SHA-256), `PUT` to `uploadUri` with `requiredHeaders`, `POST /assets/uploads/{id}/complete` | Q4, Q6, D1, D3, D4 |
| 3 | Register the HDT and attach binaries and snapshot as digital objects | `POST /hdts`, `GET /hdts?scope=MINE`, `POST /hdts/{hdtId}/enrichments`, `GET /operations/{id}` | Q4, Q7, D2, D4 |
| 4 | Annotations as queryable statements | an annotation payload through `POST /hdts/{hdtId}/enrichments` | Q5, Q8 |
| 5 | Revisions, semantic workspace, publication | not yet in the API | — |

---

## Transition

OCRA reaches KBMS directly today (`ECHOES_KB_API_BASE`). Applications are expected to use only the Cloud Platform API, and KBMS has no per-graph authorisation yet, so each flow moves to SEP once the platform covers it; until then OCRA uses both, with the same user token.

| Flow | Served by |
|---|---|
| HDT registration, enrichment, HDT RDF read, public-repository queries | SEP |
| Delete and unregister | KBMS, until the API has them |
| User- and maintenance-graph queries | KBMS, until semantic queries reach those graphs |
| HDT listing | KBMS, until `GET /hdts` works |
| Content replacement | KBMS, until revisions are stable |

---

## Open decisions

### D1 Upload limits and packaging

- **Size.** Each storage target declares a `maximumObjectSizeBytes` (`GET /spaces/{spaceId}/storage-options`). Large models and RTI packages may exceed it.
- **Transfer.** Each asset is one `PUT` to a short-lived `uploadUri`, with its length and SHA-256 declared in advance. The 0.16.0 contract has no multipart or resumable upload.
- **Packaging.** An asset is a single object. Multi-file assets (an RTI dataset with its `info.json`, a 3D model with textures) are uploaded as one ZIP, the package format OCRA's ingestion already accepts, so import needs no new logic.
- **Versions.** Assets are immutable. A changed file is a new upload with a new `assetId`; an unchanged file, recognised by its SHA-256, is not uploaded again.

Proposal: upload single files as they are and multi-file assets as one ZIP; refuse to save an asset that exceeds its target's limit, with a clear message, until Q6 is answered.

### D2 Scene-level annotations

Each enrichment names exactly one `subjectAssetId`, while OCRA geometry is scoped to a scene or an asset (`referenceType` + `referenceId`).

- **Asset-scoped** annotations use the asset's registered id directly.
- **Scene-scoped** annotations are in scene coordinates and may span several models. Either a scene description becomes the subject, keeping the scene frame, or each underlying asset gets its own enrichment with geometry converted into that asset's frame (see [Reference Frames](./reference-frames.md)), which splits multi-model annotations.

Proposal: use the project snapshot as the subject, uploaded as a MANAGED asset. OCRA already writes it for ECHOES, the HDT RDF already points to it (`ocra:hasProjectSnapshot`), and it contains the HDT document with its scenes together with the annotations. Inside the snapshot, assets are referenced by `canonicalUri`, not by OCRA paths.

### D3 Package retention

OCRA deletes an uploaded package after extracting it, so at save time there is nothing to upload.

- **Keep the original** until it is saved to the platform: byte-exact, so the SHA-256 check for unchanged assets is reliable, at the cost of a second local copy.
- **Re-zip the extracted folder** at save time: no extra disk, but slower, and not byte-identical to the user's file.

Proposal: keep the original package.

### D4 Project owner

OCRA has no project owner today: authority comes from `ProjectRole`, and a project may have several managers. Platform writes need exactly one identity, because `/spaces/me` resolves to the caller's space and another manager's save would land in a different space.

- **Who.** The manager who first saves the project to the platform becomes its owner; later saves are offered only to them.
- **Where.** The owner's user id is stored in the HDT document's `echoesContext`, next to the HDT's platform identifiers. No Prisma change.
- **Costs.** The owner's quota holds all the project's binaries, and the canonical assets are tied to that person's account.
- **Transfer.** Assets cannot be moved between spaces. A new owner keeps the existing assets by `canonicalUri` and uploads only new or changed ones to their own space, so the project then spans two spaces. A clean move needs the shared ECCCH project (Q3).

## Questions for PCSS

- **Q1 Environments.** OCRA runs a development setup against EGI Check-in Demo (`aai-demo.egi.eu`) and a production setup against Check-in production (`aai.egi.eu`), and reaches KBMS at `echoes-kb-api-route-echoes-graphs-production.apps.dcw1.paas.psnc.pl`. Only staging is known for the platform: `https://api-staging.culturalheritagecloud.eu`.
  - Which platform environments exist (devel, staging, production), and what is each one's base URL?
  - Which Check-in issuer does each environment accept? OCRA needs a pair it can use for development (Demo) and one for production.
  - Which KBMS does each environment write to? During the transition OCRA uses both, so an HDT registered through the platform must be visible at OCRA's `ECHOES_KB_API_BASE`, and the reverse.
  - Is staging data kept or periodically reset, and may OCRA's development instances write test HDTs and assets there?
  - Do staging HDTs and assets also get `https://id.culturalheritagecloud.eu/...` URIs? If so, how does a client tell staging identifiers from production ones?
  - Is the OpenAPI document served by each environment, and how are breaking changes to the experimental 0.16.0 contract announced?
- **Q2 Access.** VTL works with its own Check-in Demo client and no further registration.
  - Is anything needed for OCRA's production Check-in client?
  - Which entitlement in `vo.echoes.eu` grants access? OCRA needs it to tell a user without membership why ECCCH actions are unavailable.
- **Q3 `projectUri`.** `POST /hdts` takes a `projectUri`; VTL sends a fixed `https://culturalheritagecloud.eu/projects/vtl-poc`. Is it free, or will it become the identifier of the shared ECCCH project agreed in Paris, which OCRA would move to from the owner's Personal Space (D4)?
- **Q4 Published content.**
  - Will the Cloud Platform API expose the Semantic Private Workspace? It is the only save-then-publish path, today only in the Portal.
  - How is an enrichment corrected or withdrawn? The API has no `DELETE`.
  - Can other users read the MANAGED assets of an HDT? They sit in the owner's Personal Space, and a project opened in another instance is usually opened by someone other than its owner.
- **Q5 Annotation mapping.** Only needed if OCRA's annotations become queryable through a mapper rather than native RDF: the only mapping in use, `hdto-digital-object/0.1`, links an asset without reading it. Who would write and host a mapper for the OCRA snapshot? Confirm that `enrichmentType` is a free label (VTL sends `DIGITAL_OBJECT` and `OCR`); OCRA would send `ANNOTATION`.
- **Q6 Upload limits.** What is the maximum object size per storage target, and are multipart or resumable uploads planned? 3D models and RTI packages can reach several gigabytes, which a single `PUT` handles poorly. Is range retrieval on `GET /assets/{id}/content` planned, as the Paris meeting listed?
- **Q7 Existing HDTs.** HDTs registered through KBMS `/hdt/register` have only a KBMS URI and no platform `hdtId`, so the enrichment endpoint cannot address them, and `GET /hdts?scope=MINE` does not find them. Can SEP adopt them into its HDT directory, or must they be registered again, creating a second twin for the same object?

## Questions for CyI and FORTH

- **Q8 Validation.** SHACL shapes and a common validation call are planned. Will they cover the `hdto-enrichment/0.2` profile, so OCRA can validate before uploading, and accept OCRA's vocabulary (`https://data.ocra.echoes.eu/ontology#`)? OCRA has no annotation RDF today, so a native payload means new serialisation code.

---

*Last reviewed: 2026-11-19*
