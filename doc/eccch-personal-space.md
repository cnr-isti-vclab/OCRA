# ECCCH Personal Space Integration

## Status and references

The Cloud Platform API integration described below is **planned, not implemented**. The current implementation uses KBMS directly. This design targets the experimental Platform API 0.16.0, the User Personal Space model in D6.3 §4.5, and the VTL demonstration in the 24 November 2026 draft of D16.1. Endpoint availability, permissions and limits must be confirmed against the chosen deployment before implementation.

VTL is the reference client: [`echoesPlatformClient.js`](https://github.com/ECHOES-ECCCH/Vertical-Application-VTL/blob/master/portal-ui/src/custom/services/echoes/echoesPlatformClient.js) for calls and payloads, and [`EchoesPlatformRepository.java`](https://github.com/ECHOES-ECCCH/Vertical-Application-VTL/blob/master/portal-bl/src/main/java/pl/psnc/vtl/portal/repositories/echoes/EchoesPlatformRepository.java) for server-side import. These links follow `master`; record the VTL commit and Platform API release used when validating OCRA's integration.

## Current implementation

- **Editing and collaboration remain local.** PostgreSQL holds projects and `ProjectRole` permissions; MongoDB holds project content and annotations; `project_files/` holds local assets. A project may have several managers and has no designated platform publishing account.
- **ECHOES calls go to KBMS.** The backend forwards the caller's session access token to `ECHOES_KB_API_BASE`. It registers HDTs with `/hdt/register` and submits RDF through `/hdt/enrich` or `/hdt/replaceContent`. These are not Portal Semantic Workspace operations.
- **Local integration state** records `digitalTwinUri`, `namedGraphUri`, `projectUri`, synchronization status, asset records and snapshot references. It does not yet track a separate platform `hdtId`, workspace ID, managed operation ID or publishing account.
- **Annotations travel in the project snapshot.** OCRA serializes project/asset metadata as RDF and embeds the snapshot JSON, including annotations, as `ocra:snapshotJson`. Individual annotations do not thereby become queryable domain RDF statements.
- **Local managers and system administrators can register and publish**, using their own authenticated session. Those local permissions do not establish rights over another user's platform resources.

Implementation references: [KBMS integration](../backend/src/services/echoes-kb.service.ts), [publication permissions](../backend/src/controllers/echoes.controller.ts), [ECHOES context](../shared/types.ts), [RDF serialization](../backend/src/services/echoes-rdf.service.ts), and [project snapshots](../backend/src/services/ocra-project-snapshot.service.ts).

## Terminology and boundaries

| Concept | Meaning |
|---|---|
| OCRA project | The application's collaborative editing context, with scenes, assets and annotations. |
| HDT | The semantic object to which OCRA contributes; its identity is separate from the local project and any storage or working context. |
| User Personal Space (UPS) | One canonical logical platform capability per user, comprising a private binary zone and a private semantic workspace. It may use multiple backends and hold resources associated with several OCRA projects. |
| Portal Semantic Workspace | An individually managed RDF working context within the semantic part of the UPS, labelled “Semantic Workspace” in the Portal. A user can create several. D16.1 demonstrates one publication per context, after which it enters `PUBLISHED`. |
| KBMS named graph | A repository-level semantic container addressed by OCRA's current integration. Its URI is not automatically a Portal workspace ID. |

An RDF file stored as a MANAGED asset, its statements imported into a semantic context, and a contribution published to an HDT are distinct states. Publishing one Portal Semantic Workspace does not publish the whole UPS or make an OCRA project read-only. The Portal demonstration does not establish a VA-facing workspace API or permissions for collaborators. OCRA does not need one Portal Semantic Workspace per project.

## Planned model

- **Project/HDT association.** Retain OCRA's project-to-HDT association and preserve existing HDT identities (Q7). For new registrations, propose the physical object's URI as `heritageEntityUri` and the OCRA project URL as `projectUri`, subject to Q3. User-scoped search by heritage entity URI is a discovery aid; it must not replace a persisted, verified HDT association.
- **Personal assets.** Any user's UPS can be an import source for assets that user may read. For the initial owner-scoped publication flow, propose one designated platform publishing account per project (D4). This is an application restriction, not a change to OCRA project roles.
- **Local work.** Keep MongoDB, annotation editing, OCC and SSE unchanged. Only explicit platform import, upload and contribution actions use the new integration.
- **Identity.** Forward the authenticated user's EGI Check-in access token to the platform, which validates it and handles downstream KBMS credentials. Keep users keyed on `sub` (`voperson_id`), never on email. Confirm issuer and entitlement requirements in Q1–Q2.
- **Managed binaries.** Propose uploading project binaries, including copies imported from external URLs, as MANAGED assets for portability. Retain platform `canonicalUri` values and authenticated content routes separately from local file paths. This is an OCRA storage choice, not a platform requirement to copy every external resource. Reopening from another OCRA instance depends on access to every required resource, supported formats and reconstructable packages (Q4, Q6).
- **Working copies.** Keep `project_files/` for rendering and editing. Store original asset packages in the platform; derive viewer-specific files locally. Extend import to retrieve managed content with the authorised user's token. Package retention is still a design decision (D3).
- **Upload and contribution are separate.** Propose using `https://culturalheritagecloud.eu/mappings/hdto-digital-object/0.1` to link binaries and snapshots to an HDT through `HP29_has_digital_object_part`, following VTL. Uploading stores an asset; successful enrichment changes the HDT. OCRA may combine these steps in an explicit “Publish to ECHOES” action, but must report partial completion if upload succeeds and enrichment fails. Neither step alone establishes public or collaborator access. Queryable annotation statements require separate RDF or mapping work (Q5, Q8).
- **Asynchronous operations.** Persist returned operation IDs, distinguish pending, failed and reconciliation-required outcomes, and resume status checks after reauthentication. Do not assume whether an accepted operation continues after session expiry until Q9 is answered. Operation state must remain separate from local synchronization and workspace lifecycle state.
- **Archiving.** In the D16.1 baseline, archiving excludes an asset from default discovery but retains content, quota use and HDT links; it is not deletion or automatic access revocation. Do not offer permanent deletion through the new asset integration without a supported contract. Existing KBMS delete/unregister helpers are separate flows.

When extending `echoesContext`, keep local IDs, platform IDs, environment/base-URL context, publishing identity and operation references distinct. In particular, `EchoesAssetRecord.assetId` currently contains a **local OCRA asset ID**; add an explicit platform mapping rather than silently changing its meaning. Add workspace state only if workspace integration is actually implemented.

## Planned steps

Application paths are under `/platform/v1`; `/api/v1` is the internal prefix. The paths below follow the reviewed VTL/0.16.0 baseline, not an implemented OCRA client. For commands supporting `Idempotency-Key`, reuse the same key for retries of the same logical command, including its operation type and payload. Verify successful digital-object enrichments through `POST /semantic-queries` and the returned canonical asset URIs.

| Step | Scope | Endpoints or contract | Dependencies |
|---|---|---|---|
| 1 | Import personal assets: authenticated MANAGED content or REFERENCED `externalUri` | `GET /spaces/me/assets`, `GET /assets/{id}`, `GET /assets/{id}/content` | Q1, Q2 |
| 2 | Upload project binaries and snapshots | `POST /spaces/me/assets/uploads` (name, type, size, SHA-256), `PUT` to `uploadUri` with `requiredHeaders`, `POST /assets/uploads/{id}/complete`, `GET /assets/uploads/{id}` | Q4, Q6, Q9, D1, D3, D4 |
| 3 | Register or resolve an HDT and attach digital objects | `POST /hdts`, `GET /hdts?scope=MINE`, `POST /hdts/{hdtId}/enrichments`, `GET /operations/{id}` | Q3, Q4, Q7, Q9, D2, D4 |
| 4 | Make annotations queryable as statements | Agreed RDF payload or mapper through the enrichment contract | Q5, Q8 |
| 5 | Prepare RDF in a Portal Semantic Workspace and publish/revise contributions | Demonstrated through the Portal; VA-facing endpoints, permissions and revision semantics remain unconfirmed | Q4, Q8 |

## Planned transition from KBMS

OCRA currently accesses KBMS directly. The latest D16.1 leaves continued direct access to protected KBMS endpoints open. Move individual flows to the Platform API only after confirming functional coverage, environment alignment, identifier compatibility and access rules. Do not retire direct calls solely because of the UPS terminology. This table describes proposed migration, not current routing.

| Current flow | Proposed transition condition |
|---|---|
| HDT registration, enrichment, RDF read and public-repository queries | Use the platform when its deployed contract covers OCRA's payloads and resource scope. |
| Delete and unregister | Retain the current KBMS path until an agreed replacement and lifecycle policy exist. |
| User- and maintenance-graph queries | Retain KBMS access until supported platform queries cover the required graphs and permissions. |
| HDT listing | Migrate when discovery covers OCRA's existing as well as newly registered HDTs. |
| Content replacement | Preserve existing graph-lineage semantics until supported revision behaviour is agreed. |

## Proposed design choices

These choices are not implemented and are not platform guarantees.

### D1 Upload limits and packaging

The reviewed 0.16.0 design uses one `PUT` to a time-limited URL with declared length and SHA-256; no resumable or multipart flow has been established for OCRA. Storage options expose `maximumObjectSizeBytes`; confirm the deployed limits in Q6.

Proposal: upload single files unchanged and package multi-file models or RTI datasets as ZIPs, reusing OCRA's ingestion formats. Reject oversize packages clearly until an appropriate transfer mechanism is available. Treat changed content as a new asset; reuse a recorded, accessible asset for unchanged content where permitted. Do not assume server-side deduplication from a checksum alone.

### D2 Scene-level annotations

The reviewed enrichment pattern uses `subjectAssetId`, while OCRA geometry can refer to a scene or an asset (`referenceType` + `referenceId`). Per-asset mapping is straightforward for asset-scoped geometry. Scene-scoped geometry may span models; splitting it would require coordinate conversion (see [Reference Frames](./reference-frames.md)) and could lose the joint scene context.

Proposal: first preserve the whole project snapshot as a MANAGED digital object, subject to the supported enrichment profile. OCRA already generates this snapshot, including scenes and annotations. A portable platform snapshot would need to map local asset references to platform canonical URIs; that transformation is not implemented. Linking the snapshot is distinct from making its annotations queryable, which requires Q5/Q8.

### D3 Package retention

The current ingestion workflow does not guarantee retention of the original uploaded archive for a later platform upload. Keeping it preserves exact bytes and makes checksum-based reuse reliable, at the cost of an extra local copy; repackaging extracted files costs processing time and may produce different bytes.

Proposal: retain the original package until a successful managed upload is confirmed, then manage the local copy according to the working-cache policy.

### D4 Designated platform publishing account

OCRA currently authorises through `ProjectRole` and may have several managers. `/spaces/me` resolves to the caller, so uploads by different managers would target different personal spaces.

Proposal: the manager who first performs the agreed platform publication becomes the designated publisher, recorded in `echoesContext` without changing existing project roles. Restrict only the new platform actions requiring that account, and always let the platform enforce resource permissions. Other managers continue local project management; do not reuse another manager's token to bypass permissions.

This is an interim application policy pending supported collaboration/delegation, not ownership of the entire OCRA project. The publishing account bears the quota for its uploads. Transfer and account departure remain open: retaining canonical URIs does not guarantee continued access to old assets, and neither moving assets nor a shared project space should be assumed available (Q3, Q4).

## Open questions for PCSS

- **Q1 Environments.** OCRA has development (Check-in Demo, `aai-demo.egi.eu`) and production (`aai.egi.eu`) configurations and currently targets KBMS at `echoes-kb-api-route-echoes-graphs-production.apps.dcw1.paas.psnc.pl`. The demonstrated platform is `https://api-staging.culturalheritagecloud.eu`.
  - What are the supported environment URLs and accepted issuers?
  - Which KBMS does each platform environment use, and how will existing and newly registered HDTs be visible across the transitional routes?
  - Is staging data retained or reset, and may development instances create test resources?
  - Are canonical URI patterns shared across environments? How should clients distinguish them?
  - Where is each release's OpenAPI contract, and how are breaking changes announced?
- **Q2 Access.** D16.1 demonstrates VTL with its own Check-in Demo client. What registration or configuration is required for OCRA's development and production clients? Which scopes, audiences and `vo.echoes.eu` entitlements grant access, and how should missing permissions be reported?
- **Q3 `projectUri` and collaboration.** VTL sends `https://culturalheritagecloud.eu/projects/vtl-poc`. May OCRA use its project URL, and what authority does that association convey? Is it related to a future shared ECCCH project? How would membership, publishing-account transfer and moving assets between spaces work? Multiple personal semantic contexts do not establish shared project spaces.
- **Q4 Semantic working contexts and published content.**
  - Which create/import/preview/publish operations demonstrated for Portal Semantic Workspaces are available to VAs, with which payloads and permissions? Can they reuse OCRA's existing RDF serializer?
  - How is an enrichment corrected or withdrawn? Does a new workspace publication add a contribution or supersede an earlier one?
  - Can another authorised user retrieve MANAGED assets associated with an HDT, and does publication change binary access permissions?
  - Where is private semantic isolation enforced while KBMS fine-grained graph authorisation remains under development, including on direct KBMS routes?
- **Q5 Annotation mapping.** The demonstrated `hdto-digital-object/0.1` mapping links an asset; it does not establish domain RDF for OCRA's annotation JSON. Who would write and host a snapshot mapper if that route is selected? Is `enrichmentType` a free label, and would `ANNOTATION` be accepted? VTL uses `DIGITAL_OBJECT` and `OCR`.
- **Q6 Binary transfer.** What are the deployed size limits, upload URL lifetimes and supported retry/resume mechanisms? Are multipart uploads and range retrieval on `GET /assets/{id}/content` planned for large models and RTI packages?
- **Q7 Existing HDTs.** OCRA has KBMS HDT URIs but no corresponding platform `hdtId` records. How can the platform resolve/adopt them and include them in authorised discovery without registering duplicate twins?
- **Q9 Recovery.** Does an accepted operation continue after the initiating session expires? How can OCRA recover its outcome after reauthentication? Which commands are idempotent, how long are keys retained, and how are failed or abandoned uploads, reserved quota and reconciliation-required outcomes handled?

## Open questions for CyI and FORTH

- **Q8 Validation.** Will the planned SHACL shapes and validation service cover `hdto-enrichment/0.2` and OCRA's vocabulary (`https://data.ocra.echoes.eu/ontology#`)? Which representation is accepted for scene-level annotations? OCRA already emits project/asset RDF, but native annotation RDF would require new serialization code.

---

*Last reviewed: 2026-11-24. Current implementation checked at commit `35000f5`; no live platform validation performed for this revision.*
