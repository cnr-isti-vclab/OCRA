# OCRA Workflow

Last validated against code: 2026-05-19.

## Introduction

OCRA (Online Conservation-Restoration Annotator) is a collaborative, web-based platform that supports conservation-restoration workflows by enabling structured spatial annotation and semantic enrichment of 2D and 3D representations of cultural heritage objects. It is developed within the ECHOES project as a Vertical Application (VA01) of the European Collaborative Cloud for Cultural Heritage (ECCCH).

OCRA operates as an application-level workspace. Projects created within OCRA may be associated with one or more Heritage Digital Twins (HDTs) and can later be published to the ECHOES Knowledge Base as a separate, explicitly governed action.

---

## 1. Role Model

OCRA uses a two-level role model: system-level roles (global flags on the user account) and project-level roles (per-project assignments). For the full permission matrix see [roles-and-access-control.md](roles-and-access-control.md).

### 1.1 System-Level Roles

| Role | Description |
| --- | --- |
| `sys_admin` | Full system access. Can manage all users, assign `sys_creator` rights, access and modify all projects regardless of project role. |
| `sys_creator` | Can create new projects and vocabulary registry entries. Has no special privileges on projects created by others unless explicitly assigned a project role. |
| Authenticated user | Any logged-in user without additional flags. Can browse public projects and their metadata. Cannot create projects or access private project content. |
| Anonymous | Unauthenticated user. Can list and view metadata of public projects only. Cannot access HDT content, scenes, or annotations. |

> New users are created on first login with no additional flags. They can see public projects but cannot create projects or access private project content until explicitly assigned a role.

### 1.2 Project-Level Roles

| Role | Description |
| --- | --- |
| `manager` | Created automatically as project owner. Full control over the project: update metadata, manage members, upload/remove assets, create/delete scenes, create/edit/delete annotations, export and publish HDT content (RDF). Structural operations require holding a StructuringLock. |
| `editor` | Can create, update, and mark-as-erasable annotations. Cannot manage scenes, assets, project metadata, or project membership. |
| `viewer` | Read-only access to project content: physical object metadata, digital assets, scenes, and annotations. Can see the list of project members. Cannot create or modify any content. |

---

## 2. Illustrative Workflows

The following workflows are drawn from the ECHOES D8.1 deliverable (*Concepts for Vertical Applications*) and describe representative usage scenarios for OCRA. They illustrate how the role model, collaborative editing, and HDT integration work together in practice.

---

### 2.1 Workflow A — 3D Annotation of a Statue

**Context:** Monitoring surface degradation over time on a statue represented by two aligned 3D models.

**Actors:**
- **Anna** — OCRA administrator (`sys_admin`)
- **Bern** — professor and project creator/manager (`sys_creator`, project `manager`)
- **Carl** — doctoral student, annotator (`editor`)
- **Denise** — colleague reviewer (`viewer`)

**Narrative:**

Bern wants Carl to analyse and annotate signs of degradation observed over time on a statue represented by two temporally distinct 3D scans. He obtains project creation rights from Anna, logs in, and creates a new project (*"Allegoria della Disperazione"*). Bern is automatically the project manager. The project is private by default and visible only to him.

Bern imports the relevant physical object metadata from the ECHOES Knowledge Base, uploads the two 3D model assets, checks that they are aligned in the same reference system, and prepares a work scene associating both models. He then assigns Carl the **Editor** role and Denise the **Viewer** role, and notifies Carl that the annotation workspace is ready.

Carl logs in, finds the project in his project list, opens the scene, and begins annotating degradation areas directly on the 3D models. Each annotation consists of a spatial anchor (point, polyline, or polygon in 3D model coordinates) linked to semantic content (label, classification, descriptive notes, and vocabulary terms). Carl saves his work progressively; annotations are persisted immediately to the server with real-time awareness of concurrent activity.

Bern reviews the annotations, adds his own observations as manager, and shares the results with Denise. Denise opens the project in read-only mode and reviews the annotated areas. When the review is complete, Bern exports the validated annotation set and publishes the enriched HDT content to the ECHOES Knowledge Base.

**Step-by-step:**

| Action | Notes |
| --- | --- |
| Anna grants Bern `sys_creator` rights | System-level administrative action. |
| Bern logs in and creates project *"Allegoria della Disperazione"* | Bern becomes project manager by default. Project is private. |
| Bern imports physical object metadata from the ECHOES KB | Physical object metadata (HC1) is stored in the HDT document. |
| Bern uploads the two 3D model assets and fills in their metadata | Assets are stored in the OCRA filesystem and registered in the HDT. Requires holding a StructuringLock for scene preparation. |
| Bern checks that the two models are aligned in the same reference system | Application-level preparation of the annotation workspace. |
| Bern creates a scene associating both models | Scene configuration stored in the HDT document. |
| Bern assigns Carl the `editor` role and Denise the `viewer` role | Membership changes require an exclusive StructuringLock. |
| Bern notifies Carl that the workspace is ready | Out-of-band communication. |
| Carl logs in and opens the project | Carl sees the project in his list thanks to his `editor` role. |
| Carl annotates degradation areas on the 3D models | Each annotation is a geometry + data + link triple stored in `ocra_content`. Real-time social locks inform collaborators of active editing. |
| Carl saves his work | Annotations are persisted immediately; OCC (version field) ensures conflict-free concurrent edits. |
| Bern reviews Carl's annotations and adds his own | Managers can create, edit, and delete annotations. |
| Bern shares the results with Denise | Denise can view all annotations in read-only mode. |
| Bern publishes the validated HDT content to the ECHOES KB | Governed publication action (Export/publish RDF), manager-only. Separate from internal project visibility. |

---

### 2.2 Workflow B — 2D/RTI Annotation of a Painting

**Context:** Analysis of surface features and conservation issues on a historical painting using Relightable Transformation Imaging (RTI) models.

**Actors:**
- **Anna** — OCRA administrator (`sys_admin`)
- **Bianca** — conservator, project creator/manager (`sys_creator`, project `manager`)
- **Charles** — conservation researcher, annotator (`editor`)
- **Denise** — conservation researcher, annotator (`editor`)
- **Elsie** — colleague reviewer (`viewer`)

**Narrative:**

Bianca is a conservator studying surface details and conservation issues in a historical painting. She wants her colleagues Charles and Denise to analyse and annotate surface features — such as craquelure, retouching areas, and pigment degradation — using multiple RTI models of the artwork acquired under different lighting conditions (visible light and multispectral).

Bianca obtains project creation rights from Anna, logs in, and creates a new project (*"Retable of S. Bernardino – Surface Study"*). She is automatically the project manager. She imports the physical object metadata from the ECHOES Knowledge Base and uploads two RTI assets (one visible-light acquisition, one multispectral). She creates a 2D scene associating both assets, which allows interactive relighting and multispectral layer switching during annotation. She assigns Charles and Denise the **Editor** role and Elsie the **Viewer** role.

Charles and Denise log in, open the scene, and work simultaneously on the painting. The viewer allows them to interactively change the light direction and switch between visible and multispectral views to reveal subtle surface features. They annotate relevant areas directly on the RTI images using point, polyline, and polygon anchors, adding structured semantic content from the controlled vocabulary. Real-time awareness (social locks) indicates when the other editor is actively working on a specific annotation.

Bianca reviews the annotation results and shares them with Elsie for discussion. Once the analysis is complete, Bianca publishes the enriched HDT content to the ECHOES Knowledge Base.

**Step-by-step:**

| Action | Notes |
| --- | --- |
| Anna grants Bianca `sys_creator` rights | System-level administrative action. |
| Bianca logs in and creates project *"Retable of S. Bernardino – Surface Study"* | Bianca becomes project manager by default. Project is private. |
| Bianca imports physical object metadata from the ECHOES KB | Physical object metadata (HC1) stored in the HDT document. |
| Bianca uploads two RTI assets (visible light and multispectral) | RTI assets stored in the OCRA filesystem. HC2 class of the HDT. |
| Bianca creates a 2D scene associating both RTI assets | The 2D viewer (OpenLIME) supports interactive relighting and layer switching. Requires StructuringLock. |
| Bianca assigns Charles and Denise the `editor` role, Elsie the `viewer` role | Membership changes require an exclusive StructuringLock. |
| Charles and Denise log in and open the scene | Both see the project in their project list. |
| Charles and Denise annotate collaboratively on the RTI images | Each annotation is a geometry + data + link triple. Social locks signal active editing to avoid conflicts. OCC guarantees consistency on concurrent saves. |
| Bianca reviews the annotation results | Manager can view, edit, and delete all annotations. |
| Bianca shares results with Elsie | Elsie accesses the project in read-only mode. |
| Bianca publishes the validated HDT content to the ECHOES KB | Governed publication action (Export/publish RDF), manager-only. |

---

## 3. Annotation Workflow Detail

Annotations in OCRA are first-class entities composed of three independent parts, each with its own lifecycle:

- **Geometry** (`annotation_geometry`): the spatial anchor — a point, polyline, or polygon expressed in the coordinate space of a scene or digital asset.
- **Data** (`annotation_data`): the semantic content — label, classification, free-text description, controlled vocabulary terms, and open metadata fields.
- **Link** (`annotation_link`): the explicit association between one geometry and one data record.

This decomposed model allows a single geometry to be reused across multiple semantic interpretations, and a single semantic record to apply to multiple spatial positions.

### Creating an annotation (editor or manager)

1. Select the target scene or asset in the viewer.
2. Draw the spatial anchor on the model (point, polyline, or polygon). The geometry is created immediately in the database.
3. Fill in the semantic content: label, classification from the controlled vocabulary, and descriptive notes. The data record is created.
4. The system creates a link between the geometry and the data record.
5. The annotation is immediately visible to all connected collaborators via real-time broadcast.

### Concurrent editing

- Multiple editors can work simultaneously in the same scene.
- **Social locks** (presence and editor locks) provide real-time awareness of who is editing what, without hard blocking.
- **Optimistic Concurrency Control (OCC)** on each entity's `version` field guarantees that conflicting concurrent writes are detected and rejected, prompting the editor to reload and retry.

### Soft-delete (erasable state)

Annotations are not hard-deleted. An editor or manager can mark an annotation as **erasable** (`erasableAt` timestamp set), which flags it for removal while preserving its audit trail. A manager can reverse this transition (mark as non-erasable) before final cleanup.

---

## 4. Project Lifecycle Summary

```
sys_admin grants sys_creator rights to user
    └─► sys_creator creates project (becomes manager)
            └─► manager configures project:
                    imports physical object metadata
                    uploads digital assets
                    creates scenes (StructuringLock required)
                    assigns editor and viewer roles (StructuringLock required)
            └─► editors annotate collaboratively
                    (geometry + data + link, OCC, social locks)
            └─► manager reviews, curates, and publishes
                    Export/publish RDF → ECHOES Knowledge Base
```

Project visibility and membership are internal OCRA concepts, independent from governed publication to the ECHOES Knowledge Base. A project can remain private while its content has been published, and vice versa.

---

*Last reviewed: 2026-05-20*
