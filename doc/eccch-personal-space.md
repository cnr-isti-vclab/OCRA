# ECCCH Personal Space Integration

## Status

Design for the next implementation phase, not implemented. It targets the ECHOES Common Platform API 0.16.0 (experimental) and the User Personal Space model of D6.3.

---

## Model

- **One OCRA project ↔ one ECCCH project space ↔ one HDT**, so each space holds content for a single Digital Twin.
- **The user's Personal Space** (`/api/v1/spaces/me`) is an import source for that user's own assets.
- **Mongo stays the working store.** Annotation editing, OCC and SSE are unchanged; only explicit import, save and publish actions call the platform.
- **Identity:** OCRA forwards the user's EGI Check-in access token to SEP, which handles KBMS authentication.
- **Binaries live in the platform.** Every binary (3D models, RTI, images, including those first imported from a third-party URL) is uploaded as a MANAGED asset to the project space. The HDT records its `canonicalUri`, and its platform content route becomes the asset's `metadata.sourceUrl`. A project saved in the KB can therefore be opened by any OCRA instance, even when the instance that created it no longer exists.
- **`project_files/` is a working copy.** The platform keeps each asset's package as uploaded; the formats the viewers use are derived from it locally and never uploaded. Opening a KB project in another instance uses the existing ECHOES import: each package is downloaded from its `sourceUrl`, now with the user's EGI token, and ingested locally. The working copy must therefore be rebuildable from the package and the HDT metadata alone.
- **Annotations** are published as an HDT enrichment: the payload (RDF, or the snapshot through a mapping profile, see Q5) is uploaded as a MANAGED asset, then submitted. Publishing stays manager-only.
- **Platform writes are asynchronous.** OCRA stores each returned operation id with the project, polls it, and shows pending, failed and reconciliation-required states.

---

## Steps

Paths are under `/api/v1`; writes send an `Idempotency-Key`.

| Step | Scope | Endpoints | Blocked by |
|---|---|---|---|
| 1 | Import from the Personal Space into a project | `GET /spaces/me`, `GET /spaces/me/assets`, `GET /assets/{id}/content` | Q1, Q2 |
| 2 | Upload project binaries as MANAGED assets; import downloads them with the user's token | `POST /spaces/{spaceId}/assets/uploads`, `PUT` to `uploadUri`, `POST /assets/uploads/{id}/complete`, `GET /assets/{id}/content` | Q3, Q6, D1, D3 |
| 3 | Publish annotations as an enrichment | upload the snapshot and the payload as in step 2, then `POST /hdts/{hdtId}/enrichments`, `GET /operations/{id}` | Q4, Q5, Q7, D2 |
| 4 | Revisions, semantic workspace, publication | not yet in the API | — |

---

## Transition

OCRA reaches KBMS directly today (`ECHOES_KB_API_BASE`). Each flow moves to SEP once the platform covers it; until then OCRA uses both, with the same user token.

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

## Questions for PCSS

- **Q1 SEP base URL.** The contract's `servers` entry is `/`. OCRA needs the development, staging and production URLs, configured as one backend variable next to `ECHOES_KB_API_BASE`.
- **Q2 Token acceptance.** SEP validates EGI access tokens by introspection and requires active ECHOES VO membership with the `member` entitlement.
  - Does it accept tokens issued to OCRA's EGI clients (development and production), or must OCRA be registered as a trusted client? Assets record a `createdByClientId`.
  - What is the exact entitlement value, so OCRA can tell a user without VO membership why ECCCH actions are unavailable?
  - If OCRA's tokens are rejected, the fallback is a service principal. A service principal has no Personal Space, which rules out step 1.
- **Q3 Project spaces.** The API reaches them only by `spaceId`; nothing creates, lists or manages them.
  - Who creates a project space, and how does OCRA learn its `spaceId`? OCRA would store it in the HDT document's `echoesContext`.
  - How are members granted? Under D6.3 the platform owns these permissions, so OCRA's managers and editors need a matching platform grant before they can upload or register assets.
  - Is one space per OCRA project intended, or should an institution's projects share one institutional space?
- **Q4 Enrichment visibility.** HDT metadata has registration and synchronisation states but no publication state.
  - Does `POST /hdts/{hdtId}/enrichments` publish immediately, or land in a working context that a separate action publishes?
  - If immediate, OCRA keeps it as a manager-only "Publish". If it lands in a working context, editors can save to ECCCH and the manager publishes later, in step 4.
  - How is a published enrichment withdrawn? The API has no `DELETE`.
  - Once an HDT is published, can other users read its MANAGED assets? Reading content needs asset-read permission, and a project opened in another instance is usually opened by someone other than its author.
- **Q5 Profile or mapping.** An enrichment must name a `semanticProfile` that validates it, e.g. `https://culturalheritagecloud.eu/profiles/hdto-enrichment/0.2`. An optional `mapping.profile` instead routes a source asset through a registered mapper.
  - OCRA has no annotation RDF today: annotations reach ECHOES only inside the project snapshot JSON. A native-RDF payload therefore means new serialisation code in OCRA; a mapping profile could consume the existing snapshot, but someone must write and host the mapper.
  - Is the 0.2 profile published, for example as SHACL, so OCRA can validate before uploading? Does it accept OCRA's vocabulary (`https://data.ocra.echoes.eu/ontology#`)?
  - Which `enrichmentType` token should OCRA use, e.g. `ocra:annotation`, and is that vocabulary registered anywhere?
- **Q6 Upload limits.** What is the maximum object size per storage target, and are multipart or resumable uploads planned? 3D models and RTI packages can reach several gigabytes, which a single `PUT` handles poorly.
- **Q7 Existing HDTs.** HDTs registered through KBMS `/hdt/register` have only a KBMS URI and no platform `hdtId`, so the enrichment endpoint cannot address them. Can SEP adopt them into its HDT directory, or must they be registered again, creating a second twin for the same object?

---

*Last reviewed: 2026-11-05*
