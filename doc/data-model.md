# OCRA Data Model (Canonical)

This document is the canonical reference for OCRA data ownership and entity boundaries.

## Scope

OCRA uses three persistence layers:

1. PostgreSQL (via Prisma): identity, authorization, project registry, vocabulary registry, sessions.
2. MongoDB: HDT project content aggregate and audit and logging events.
3. Filesystem (`project_files`): binary payloads (3D/RTI files) and derived exports.

## Source of Truth

- Relational schema: `backend/prisma/schema.prisma`
- HDT aggregate behavior: `backend/src/services/hdt-metadata.service.ts`
- Public asset URL mount: `backend/src/app.ts`
- Path helpers: `backend/src/utils/project-static-paths.ts`

If this document conflicts with those files, update this document in the same change set.

## 1) PostgreSQL Model (Prisma)
This is the main source of truth for identity, authorization, and project registry. It is the basis for all access control decisions and user management features. It keeps no information about project content, assets, or scenes, which are owned by MongoDB.

## `User`
- Primary key: `id` (cuid)
- External identity key: `sub` (unique came from the OAuth provider, e.g. Keycloak)
- Email: `email` (unique came from OAuth provider, used as login identifier)
- Global privileges:
  - `sys_admin` (full system access, can manage users, projects, vocabularies)
  - `sys_creator` (can create new projects and vocabularies)
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
- `manager` is the only role that can edit project metadata, manage project users/roles, add assets, and publish HDT content.
- `editor` can modify project content but cannot manage users or publish HDT content.
- `viewer` can only view project content.

## `ProjectRole`
- Primary key: `id`
- Foreign keys:
  - `userId -> User.id`
  - `projectId -> Project.id`
- Role: `RoleEnum`
- Constraint: unique `(userId, projectId)`

## `Vocabulary`
This one is very preliminary and not fully fleshed out, but it is owned by PostgreSQL and managed by system admins. It is used to define controlled vocabularies for annotation types and fields. It has no direct relation to projects or users, but it could be referenced by annotations in the HDT content. The registry is reasonable that stay in the PostgreSQL, the actual data of a vocabulary could be stored in MongoDB.
- Primary key: `id`
- Unique `name`
- Required `description`
- Visibility flag: `public`

## 2) MongoDB Model

## `hdt_collection` (HDT document per project)

One logical HDT aggregate per `projectId`:

- `projectId` (bridge key to PostgreSQL `Project.id`)
- `physicalObjectMetadata` it is a typed JSON object that contains the basic metadata for the physical object represented in the HC1 class of the HDT. 
- `digitalAssets[]`
- `scenes[]`
- Audit metadata:
  - `createdAt`, `updatedAt`
  - `createdBy`, `updatedBy`

## `PhysicalObjectMetadata`
This is a typed JSON object that contains the basic metadata for the physical object represented in the HC1 class of the HDT. Ideally the information contained here should be just a reference to an external URI that is the source of truth for the metadata of the object itself that is cached here (like for example a QXXXX for Wikidata or the catalog entry of the Italian ARCO), but we can also have some basic fields here for easier querying and indexing. 
- `sourceUri` required,  the URI that is the source of truth for the metadata of the physical object, e.g. a Wikidata QXXXX or an ARCO catalog entry
- `sourceType` required  (e.g. `ECHOES`, `wikidata`, `arco`, `other`)
- `dublinCore` cached fields from the source, e.g. title, description, creator, date, etc. These fields are somewhat redundant with the sourceUri and are filled by a metadata extraction process that can be triggered at HDT creation time or later and cached here for easier querying and indexing.

See the physical-object.md for more details on the metadata model for the physical object.


## `DigitalAsset` (inside HDT document)
- `id` (asset id, unique within project document)
- `publicUri` (mandatory for each asset we should have a uri that is the source of truth for the asset, from which we can copy locally the asset internally for more efficient use. This is the uri that should be used in the HDT published, and it should be stable across imports/exports. It should be a reference to an external repository)
- `type` (`3d-model`, `rti`, `image`, `video`, `other`)
- `assetParadata` (free-form JSON for traditional acquisition paradata, it could be extracted by the uri/manifest or provided by the user at upload time; there will be a way of mapping it into the HC2 Class of the HDT, but we can keep it free-form for now)
- `label`
- `description`
- `thumbnail` (optional, local URL; if not provided the frontend can generate it on the fly for 3D models and RTI)
- `entryPointUrl` (local URL where the asset can be accessed, e.g. `/assets/projects/<projectId>/3d-model/<assetId>/model.gltf`)
- `mimeType` (e.g. `model/gltf+json`, `image/jpeg`, etc.)
- Upload metadata (`uploadedAt`, `uploadedBy`)

## `HDTScene` (inside HDT document)
A scene is a specific configuration of digital assets for visualization and annotation. 
It is defined by a set of asset references and their relative positions. It is owned by the HDT document.
- `id` (scene id, unique within project document)
- `label`, `description`
- `type` ( `3D`, `2D`, eventually we will support also other types of mixed 3D/2D scenes, but for now we can keep it simple with just 3D and 2D)
- `assets[]` (array of `SceneAssetReference` objects)
- `environment` (typed JSON object for scene environment settings, e.g. background color, lighting, ground plane, camera position, etc.)
- `annotations[]` (array of annotation ids that are associated with this scene)  
- Timestamps and authorship fields (optional)

## `Annotation` (inside HDT document)
- `id` (annotation id, unique within project document)
- `referenceType` ('asset' or 'scene'; annotations are associated to a specific asset, or to a specific scene and have a meaning only in the context of that scene, for example an annotation tied to a specific point between two 3D models in a specific scene configuration)
- `targetId` (references either an `HDTScene.id` or a `DigitalAsset.id`, depending on the type)
- `annotationGeometry` (JSON, type-specific, for the spatial/geometric definition of the annotation, e.g. point coordinates, bounding box, polygon vertices, etc.)
- `annotationData` (JSON for the semantic content of the annotation, e.g. fields filled by the user, controlled vocabulary terms, etc.)
- `annotationParadata` (free-form JSON for paradata related to the annotation, e.g. creation method, tools used, etc.)
- Timestamps and authorship fields (optional)

## `AnnotationGraph` (inside HDT document)
To be defined later to connect the annotations between themselves. For example, it could be a graph structure where the nodes are the annotations and the edges are the relationships between them (e.g. "is part of", "is similar to", etc.). This is not strictly necessary for the first version, but it could be useful for more complex annotation scenarios.

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

## 6) Access Control Operation Matrix
Defines for each role (system level and project level) what operations are allowed on which data stores. This is the basis for implementing authorization checks in the backend controllers.

Legend:
- ✅ allowed
- ❌ denied
- ⚠️ conditional (see notes)

Resolution rules: 
System roles (`sys_admin`, `sys_creator`) are orthogonal to project roles and evaluated first:
1. `sys_admin` bypasses all project-scoped role checks.
2. `sys_creator` can create new registries/projects globally but has no special permissions on existing projects unless assigned a project role.

Project-scoped permissions are evaluated from `ProjectRole` and are meant to be a superset of permissions (`manager > editor > viewer > authenticated`).
A user can have multiple roles but in different projects (should not happen due unique `(userId, projectId)`).

### 6.1 Project Registry (PostgreSQL)

| Operation | Anonymous | Authenticated | Viewer | Editor | Manager | `sys_creator` | `sys_admin` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| List projects | ⚠️ (public only) | ⚠️ (public + assigned) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read project metadata by id | ⚠️ (public only) | ⚠️ (public only) | ✅ | ✅ | ✅ | ⚠️ (public only) | ✅ |
| Create project | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### 6.2 Project Management  (PostgreSQL)
| Operation | Anonymous | Authenticated | Viewer | Editor | Manager | 
| --- | --- | --- | --- | --- | --- | 
| Update project metadata (`name`, `description`, `public`) | ❌ | ❌ | ❌ | ❌ | ✅ | 
| Delete project | ❌ | ❌ | ❌ | ❌ | ✅ |
| List project members | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add/update/remove project member roles | ❌ | ❌ | ❌ | ❌ | ✅ |



### 6.3 HDT Content (MongoDB + Filesystem)

| Operation | Anonymous | Authenticated | Viewer | Editor | Manager | 
| --- | --- | --- | --- | --- | --- | 
| Read HDT document (`/hdt`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Read generated scene JSON (`/scenes`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create/update/delete `physicalObjectMetadata` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Add/update/delete `digitalAssets[]` metadata | ❌ | ❌ | ❌ | ❌ | ✅ |
| Upload/remove asset files under `project_files/<projectId>/...` | ❌ | ❌ | ❌ | ❌ | ✅ |
| Create/update/delete scenes | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add/update/remove scene-asset references | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Create/update/delete annotations | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Export/publish RDF (`/export/rdf`) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

### 6.4 Vocabulary Registry (PostgreSQL + optional payload in MongoDB)

| Operation | Anonymous | Authenticated | Viewer | Editor | Manager |
| --- | --- | --- | --- | --- | --- |
| List vocabularies | ⚠️ (public only) | ✅ | ✅ | ✅ | ✅ |
| Read vocabulary by id | ⚠️ (public only) | ✅ | ✅ | ✅ | ✅ |
| Create vocabulary registry entry | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update/delete vocabulary registry entry | ❌ | ❌ | ❌ | ❌ | ❌ |

Conformance note:
- This matrix is canonical for policy decisions. If an endpoint behavior differs, treat it as drift and reconcile implementation or documentation in the same PR.



## 7) Change Management Rule

For any model-related change:

1. Update Prisma or HDT service first.
2. Update API types/contracts.
3. Update this file (`doc/data-model.md`) in the same PR.
4. Update user/developer docs that reference changed entities or routes.
