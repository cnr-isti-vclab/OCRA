# ECCCH Personal Space and Common Platform Integration

## Status

Design note, not implemented. It records how the ECCCH User Personal Space and the experimental Common Platform API relate to OCRA's current ECHOES integration, proposes an OCRA-side model, and lists the questions that block implementation.

Audience: OCRA developers, PCSS (Common Platform / SEP) and FORTH (KBMS).

---

## Sources

- **D6.3** *Architecture for Data and Cloud Components* (PCSS, doi:10.5281/zenodo.20444206): Decisions 6–7, §4.4–4.6, §5.2–5.3, Annex A.
- **D6.2** *Interoperability Requirements and Guidelines* (PCSS, doi:10.5281/zenodo.18656368): Annex C, VTL Personal Space evidence.
- **ECHOES Common Platform API 0.16.0** (experimental, PCSS). Contract: `contracts/common-platform-api/src/main/resources/openapi/common-platform-api.yaml` in the PCSS platform repository. It is not in the public ECHOES GitHub organisations.
- **FORTH KBMS (EKBM) API 2.2.0**, the Knowledge Base Manager OCRA calls today: `https://echoes-kb-api-route-echoes-graphs-production.apps.dcw1.paas.psnc.pl/swagger-ui/index.html`.

---

## Architectural model

### User Personal Space

D6.3 defines the User Personal Space (UPS) as a logical capability with two linked parts: a private semantic workspace and a private binary zone. One user has one canonical UPS. Concrete resources are provisioned on the first platform-managed write, not at login (§5.2).

The Common Platform API adds institutional and project spaces alongside the Personal Space, reached through the same contracts:

| Space | Addressed by | Notes |
|---|---|---|
| Personal | `/api/v1/spaces/me` | One per user. `binaryZone` and `semanticWorkspace` start `LOGICAL` and become `READY` on first write. Service principals have none. |
| Institutional, project | `/api/v1/spaces/{spaceId}` | Addressable by id only. No endpoint creates or lists these spaces or manages their membership. |

The semantic half is realised by KBMS private spaces: named graphs on auxiliary triple stores, exposed as `/privateSpace/*` in the KBMS API. In 0.16.0 the Common Platform API has no write path into a semantic workspace.

### Rules for Vertical Applications

From D6.3 §4.6 and §5.3:

- Local working drafts stay application-local and are not platform state. The platform is not a field-by-field editing backend.
- An explicit create, save or patch crosses the governed boundary. The platform then resolves rights, targets and quota, and tracks the work as a managed operation.
- Applications do not select storage or repository targets.
- Applications are not the source of truth for platform-level visibility or permissions.
- Publication is a portal-side or explicitly exposed platform action.

### Identity

The Common Platform accepts an EGI Check-in access token. User access requires active ECHOES VO membership with the `member` entitlement. For calls into KBMS, SEP issues its own short-lived token representing the acting user, so a Vertical Application never needs a KBMS bearer.

---

## Current OCRA integration

`backend/src/services/echoes-kb.service.ts` talks to KBMS directly:

- writes: `/hdt/register`, `/hdt/enrich`, `/hdt/replaceContent`, `/hdt/deleteContent`, `/hdt/unregister`;
- reads: SPARQL over the HDT catalogue, maintenance graphs and user graphs (`ECHOES_KB_USER_GRAPH_PREFIX`);
- triple-store selection from configuration (`ECHOES_KB_PUBLIC_TRIPLE_STORE_ID`, `ECHOES_KB_FEDERATED_TRIPLE_STORE_IDS`);
- a per-session KBMS bearer, with a `@spike` override in `echoes-dev-bearer.service.ts` because EGI login does not yet provide it reliably.

Binary assets stay in `project_files/` and are served without authentication by `express.static` at `/assets/projects/<projectId>/…`. The project snapshot sent to ECHOES references an OCRA-served URL under `/assets/projects/<projectId>/echoes/`.

In D6.3 terms this is a direct entry path, permitted only as a controlled exception. Calling the KBMS `/privateSpace/*` endpoints directly would extend it: their publish operations require a `tripleStoreId`, which is the target selection D6.3 assigns to the platform.

---

## Mapping to the Common Platform API 0.16.0

| OCRA today (KBMS) | Common Platform 0.16.0 | State |
|---|---|---|
| `/hdt/register` | `POST /api/v1/hdts` (`heritageEntityUri`, `projectUri`, `name`, `description`) → `202` with `hdtId` and `canonicalUri` | available |
| `/hdt/enrich` | upload the RDF as a MANAGED asset, then `POST /api/v1/hdts/{hdtId}/enrichments` (`semanticProfile`, `semanticPayload{assetId, subjectAssetId}`, `enrichmentType`) | available |
| `/hdt/replaceContent` | `POST /api/v1/hdts/{hdtId}/revisions` (`source.assetId`, `baseRevisionId`) | experimental, marked TODO |
| `/hdt/deleteContent`, `/hdt/unregister` | — | missing |
| SPARQL reads | `POST /api/v1/semantic-queries` (SELECT only, shared/public repository only) | partial |
| HDT RDF read | `GET /api/v1/hdts/{hdtId}/content` (JSON-LD, N-Quads, TriG, TriX) | available |
| HDT discovery | `GET /api/v1/hdts?scope=MINE\|GLOBAL` | marked not working |
| files in `project_files/` | REFERENCED assets (`…/assets/references`) or MANAGED uploads (`…/assets/uploads`) | available |

All writes are asynchronous. They require an `Idempotency-Key`, return `202 Accepted` with a managed operation, and end in `SUCCEEDED`, `FAILED` or `RECONCILIATION_REQUIRED`. Clients poll `GET /api/v1/operations/{id}` using `ETag` and `Retry-After`; `GET /api/v1/operations` recovers operation ids after a restart.

A MANAGED upload declares `fileName`, `contentType`, `contentLength` and `sha256`, `PUT`s the bytes to the returned short-lived `uploadUri` with the returned headers, then calls `POST /api/v1/assets/uploads/{uploadId}/complete`, which verifies type, length and checksum. Assets are immutable: each version is a new `assetId`.

---

## Proposed OCRA model

- **One OCRA project ↔ one project space ↔ one HDT.** KBMS publish operations act on a whole private space, so one semantic workspace must never mix content for two Digital Twins. OCRA already keeps one HDT document per project (`hdt_collection`, `echoesContext.digitalTwinUri`).
- **The Personal Space is the user's own inventory**, which OCRA reads as an import source (`GET /api/v1/spaces/me/assets`).
- **Mongo remains the local draft store.** Annotation editing, OCC and SSE are unchanged; only explicit save or publish actions cross the boundary.
- **Binaries become REFERENCED assets.** OCRA registers its model and RTI URLs and receives stable `canonicalUri`s without copying bytes into platform storage. RDF payloads must be MANAGED uploads.
- **Annotation publication becomes an enrichment**: upload the RDF as an asset, submit the enrichment, track the operation. It stays manager-only in OCRA until the platform defines whether an enrichment lands in a private or public context (see [Roles and Access Control](./roles-and-access-control.md) §8).
- **OCRA relays the user's EGI access token to SEP.** For flows that move to the Common Platform, the KBMS bearer and the `echoes-dev-bearer` spike go away.
- **Platform operations are tracked per project**, so the UI can show pending, failed and reconciliation-required states.

---

## Open decisions on the OCRA side

- **Scene-level annotations.** Every enrichment needs one `subjectAssetId`. Asset-scoped annotations map directly; scene-scoped ones need either the scene description registered as an asset or one enrichment per underlying asset.
- **Profile or mapping.** OCRA can generate HDTO RDF that validates against the enrichment profile (`…/profiles/hdto-enrichment/0.2` in the contract examples), or upload its native annotation JSON and rely on a registered mapping profile.
- **Asset URL stability.** Once registered, `/assets/projects/<projectId>/…` URLs are persistent references held outside OCRA, so deleting a project or replacing a file must not silently break them. These URLs are also public today.
- **`enrichmentType` token.** An open vocabulary token, for example `ocra:annotation`, following the `echoes:htr` pattern.

---

## Questions for PCSS and FORTH

1. The SEP base URL for development and staging. The contract's `servers` entry is `/`.
2. Whether SEP accepts access tokens issued to OCRA's EGI client, or OCRA must be registered as a trusted client. Assets record a `createdByClientId`.
3. How project spaces are created, how their `spaceId` is discovered, and how membership is managed.
4. Whether an enrichment lands in a private or public context, and when publication and `semanticWorkspace` writes will be exposed. D6.3 Annex B schedules the next UPS functions for December 2026.
5. Deletion and withdrawal of HDT content, which has no endpoint in 0.16.0.
6. Whether OCRA's annotation RDF should validate against the HDTO enrichment profile or be produced through a mapping profile.
7. Whether direct KBMS `/privateSpace/*` use is a sanctioned interim exception until the platform path covers OCRA's needs.

---

## Incremental plan

| Step | Scope | Depends on |
|---|---|---|
| 1 | Read-only import from the Personal Space: `GET /spaces/me`, `GET /spaces/me/assets`, `GET /assets/{id}/content` | Q1, Q2 |
| 2 | Register OCRA project files as REFERENCED assets | Q3, asset URL stability |
| 3 | Publish annotations as an enrichment, with operation tracking | Q4, Q6, scene-level decision |
| 4 | Revisions, project spaces, semantic workspace, publication | platform roadmap |

Step 1 is the integration VTL has already demonstrated (D6.2 Annex C). It proves token relay and VO entitlement without any write semantics.

---

## Contract feedback (0.16.0)

- `GET /api/v1/hdts` is labelled "(NOT WOKRKING)" and `POST /api/v1/hdts/{hdtId}/revisions` "(Expetimental TODO)"; both contain typos.
- The `submitHdtEnrichment` description ends with a dangling sentence, "returns `409 Conflict`."
- No resource has a `DELETE` operation.

---

*Last reviewed: 2026-11-05*
