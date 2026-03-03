# OCRA Data Model (Canonical)

This document is the canonical reference for OCRA data ownership and entity boundaries.

## Scope

OCRA uses three persistence layers:

1. PostgreSQL (via Prisma): identity, authorization, project registry, vocabularies, sessions.
2. MongoDB: HDT project content aggregate and audit events.
3. Filesystem (`project_files`): binary payloads (3D/RTI files) and derived exports.

## Source of Truth

- Relational schema: `backend/prisma/schema.prisma`
- HDT aggregate behavior: `backend/src/services/hdt-metadata.service.ts`
- Public asset URL mount: `backend/src/app.ts`
- Path helpers: `backend/src/utils/project-static-paths.ts`

If this document conflicts with those files, update this document in the same change set.

## 1) PostgreSQL Model (Prisma)

## `User`
- Primary key: `id` (cuid)
- External identity key: `sub` (unique)
- Email: `email` (unique)
- Global privileges:
  - `sys_admin`
  - `sys_creator`
- Relations:
  - `sessions[]`
  - `projectRoles[]`

## `Session`
- Primary key: `id`
- Foreign key: `userId -> User.id`
- Fields:
  - `accessToken`, `refreshToken`, `idToken`
  - `expiresAt`

## `Project`
- Primary key: `id`
- Unique `name`
- Required `description`
- Visibility flag: `public`
- Relation: `projectRoles[]`

## `RoleEnum` (project-scoped)
- `manager`
- `editor`
- `viewer`

## `ProjectRole`
- Primary key: `id`
- Foreign keys:
  - `userId -> User.id`
  - `projectId -> Project.id`
- Role: `RoleEnum`
- Constraint: unique `(userId, projectId)`

## `Vocabulary`
- Primary key: `id`
- Unique `name`
- Required `description`
- Visibility flag: `public`

## 2) MongoDB Model

## `hdt_collection` (HDT document per project)

One logical HDT aggregate per `projectId`:

- `projectId` (bridge key to PostgreSQL `Project.id`)
- `metadata`
  - `dublinCore`
  - `cidocCrm`
- `digitalAssets[]`
- `scenes[]`
- Audit metadata:
  - `createdAt`, `updatedAt`
  - `createdBy`, `updatedBy`

## `DigitalAsset` (inside HDT document)
- `id` (asset id, unique within project document)
- `projectId`
- `type` (`3d-model`, `rti`, `image`, `video`, `other`)
- Labels/description (`label`, `title`, `description`)
- Entry fields (`entryPointUrl`, `entryPoint`, `mimeType`, `entrySize`)
- Upload metadata (`uploadedAt`, `uploadedBy`)
- Open metadata bag (`metadata`)

## `HDTScene` (inside HDT document)
- `id`, `name`, optional `description`
- `isDefault`
- `assets[]` (`SceneAssetReference`)
- `environment`
- Timestamps and authorship fields (optional)

## `SceneAssetReference`
- `assetId` (references `digitalAssets[].id`)
- `visible`
- Transform fields:
  - `position`
  - `rotation`
  - `scale`

## 3) Filesystem Model

Root: `PROJECT_FILES_PATH` (defaults to `/app/project_files` in container runtime).

Per-project structure:

- `project_files/<projectId>/3d-model/<assetId>/<filename>`
- `project_files/<projectId>/rti/<assetId>/...`
- `project_files/<projectId>/tmp/...`

Public URLs are served under:

- `/assets/projects/<projectId>/3d-model/<assetId>/<filename>`
- `/assets/projects/<projectId>/rti/<assetId>/...`

## 4) Ownership Boundaries

- PostgreSQL owns identity and authorization decisions.
- MongoDB owns HDT content graph (metadata, assets, scenes).
- Filesystem owns large binary payload bytes.
- `projectId` is the cross-store join key.

## 5) Required Invariants

1. `projectId` is stable across PostgreSQL, MongoDB, and filesystem paths.
2. Authorization checks are derived from PostgreSQL roles/flags, not MongoDB document fields.
3. Scene asset references must point to existing assets in the same HDT document.
4. Project deletion must clean all three layers:
   - PostgreSQL rows (`Project`, `ProjectRole` links),
   - MongoDB HDT document,
   - filesystem subtree under project root.
5. Role vocabulary for project membership is only: `manager | editor | viewer`.

## 6) Known Drift To Resolve (tracked)

These mismatches exist in current code/docs and should be removed progressively:

1. Some API/docs still mention project role `admin` (not in Prisma `RoleEnum`).
2. Some docs still describe legacy scene endpoints (`/api/projects/{projectId}/scene`) that are disabled in routes.
3. Some docs still reference old static RTI URL root (`/assets/rti/...`) instead of `/assets/projects/...`.

## 7) Change Management Rule

For any model-related change:

1. Update Prisma or HDT service first.
2. Update API types/contracts.
3. Update this file (`doc/data-model.md`) in the same PR.
4. Update user/developer docs that reference changed entities or routes.
