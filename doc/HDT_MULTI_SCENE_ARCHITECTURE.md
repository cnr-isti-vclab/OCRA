# HDT Multi-Scene Architecture Design

## Overview

This document describes the new architecture where:
1. **Digital assets (3D models, RTI, etc.) are added only from the HDT page** (not directly in the 3D viewer)
2. **Each HDT/Project has a pool of digital assets**
3. **Each HDT/Project can have multiple scenes**
4. **Each scene references assets from the HDT asset pool**

**Note on terminology:**
- **HDT = Project** (same concept, used interchangeably)
- **Metadata** = ontology-based descriptive information (Dublin Core, CIDOC-CRM, future RDF/knowledge base)
- **Digital Assets** = project resources (3D models, RTI, future: other types) - NOT metadata
- **Scenes** = configurations showing specific assets from the pool

## Current vs New Architecture

### Current Architecture (To Be Replaced)
```
Project
  └── scene.json (file-based, single scene)
      └── models: [ModelDefinition]
      
Project/HDT Document (MongoDB)
  └── hdt3DModel: single 3D model
  └── metadata: { dublinCore, cidocCrm }
```

**Problems:**
- Only one scene per project
- 3D models can be added from multiple places (HDT page, project viewer)
- Confusion about where models should be managed
- scene.json is a file on disk, separate from HDT document

### New Architecture
```
Project/HDT Document (MongoDB) - MASTER DATA
  ├── digitalAssets: [DigitalAsset]   // Pool of available assets (3D models, RTI, etc.)
  ├── scenes: [HDTScene]              // Multiple scenes
  └── metadata: {                     // Ontology-based metadata
      dublinCore: DublinCoreMetadata,
      cidocCrm: CidocCrmMetadata
    }
      
project_files/{projectId}/scenes/     // GENERATED FILES
  ├── overview.json                   // SceneDescription for "Overview" scene
  ├── detail.json                     // SceneDescription for "Detail" scene
  └── conservation.json               // SceneDescription for "Conservation" scene
```

**Benefits:**
- Clear separation: HDT page = manage assets, Viewer = select scene
- Multiple scenes per HDT (e.g., "Overview", "Detail", "Conservation")
- MongoDB is single source of truth
- Scene JSON files auto-generated from HDT (for ThreePresenter)
- ThreePresenter remains independent (loads from files)
- Easy debugging/caching with actual JSON files
- Clean separation: metadata (ontology-based) vs. digital assets (3D models, RTI, etc.)
- Extensible asset pool: ready for multiple asset types (3D, RTI, images, etc.)

## Data Model

### 1. DigitalAsset (Asset Pool Entry)
A digital asset (3D model, RTI, etc.) uploaded/added to the HDT. These are the available assets that can be used in scenes.

```typescript
interface DigitalAsset {
  id: string;                  // Unique ID (e.g., "asset_gargoyle_001")
  type: 'model3d' | 'rti' | 'image' | 'video' | 'other';  // Asset type
  fileName: string;            // Actual file on disk (e.g., "gargoyle.glb")
  fileUrl?: string;            // API URL to download
  fileSize?: number;           // Bytes
  mimeType?: string;           // "model/gltf-binary", "image/jpeg", etc.
  uploadedAt?: string;         // ISO timestamp
  title?: string;              // Display name (e.g., "Gargoyle - Front View")
  description?: string;        // Optional notes
  
  // Type-specific metadata (extensible)
  metadata?: {
    // For 3D models
    triangles?: number;
    vertices?: number;
    
    // For RTI
    rtiFormat?: string;
    lightsCount?: number;
    
    // Common
    width?: number;
    height?: number;
    duration?: number;         // For videos
  };
}
```

**Where:** Stored in MongoDB `hdt_collection.digitalAssets[]`  
**Managed:** HDT Page → Digital Assets tab  
**Actions:** Add asset, remove asset, edit title/description  
**Future:** Support for RTI, images, videos, point clouds, etc.

### 2. SceneAssetReference
Links an asset from the pool into a specific scene, with scene-specific properties.

```typescript
interface SceneAssetReference {
  assetId: string;             // Points to DigitalAsset.id
  visible?: boolean;           // Show/hide in this scene
  
  // Transform properties (for 3D assets)
  position?: [number, number, number];   // Position override for this scene
  rotation?: [number, number, number];   // Rotation override
  scale?: number | [number, number, number];  // Scale override
  
  // Future: properties for other asset types (RTI lighting, etc.)
}
```

**Where:** Stored in `HDTScene.assets[]`  
**Managed:** HDT Page → Scenes tab  
**Actions:** Add asset to scene, remove from scene, adjust properties

### 3. HDTScene
A configured view showing specific assets from the pool with their arrangement.

```typescript
interface HDTScene {
  id: string;                  // Unique ID (e.g., "scene_overview")
  name: string;                // Display name (e.g., "Overview")
  description?: string;        // Optional notes
  assets: SceneAssetReference[];  // Assets in this scene (from pool)
  isDefault?: boolean;         // Default scene to load
  environment?: {              // Scene-specific settings
    background?: string;
    showGround?: boolean;
    headLightOffset?: [number, number];
  };
  createdAt?: string;
  updatedAt?: string;
}
```

**Where:** Stored in MongoDB `hdt_collection.scenes[]`  
**Managed:** HDT Page → Scenes tab  
**Viewed:** Project Page → 3D Viewer (with scene selector)

### 4. HDTDocument (Complete Project/HDT Document)
Complete HDT document stored in MongoDB.

```typescript
interface HDTDocument {
  _id?: ObjectId;
  projectId: string;           // Link to PostgreSQL project
  
  // Ontology-based metadata (for future RDF/knowledge base integration)
  metadata: {
    dublinCore: DublinCoreMetadata;   // Dublin Core ontology
    cidocCrm: CidocCrmMetadata;       // CIDOC-CRM ontology
  };
  
  // Digital assets pool (3D models, RTI, images, etc.)
  digitalAssets: DigitalAsset[];   // Pool of available digital assets
  
  // Scene configurations
  scenes: HDTScene[];          // Multiple scene configurations
  
  // Document timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;          // User ID who created
  updatedBy?: string;          // User ID who last updated
}
```

**Note:** 
- In the future, the `metadata` section will be managed via RDF and synchronized with a knowledge base
- The `digitalAssets` pool is extensible to support new asset types (RTI, photogrammetry, etc.)

## User Workflows

### Workflow 1: Project Manager Sets Up HDT/Project

**Step 1: Add Ontology-Based Metadata** (HDT Page → Metadata Tabs)
1. Navigate to HDT page for project
2. Fill Dublin Core metadata (title, description, creator, etc.)
3. Fill CIDOC-CRM metadata (object type, time span, etc.)
4. Save metadata (future: sync to RDF knowledge base)

**Step 2: Add Digital Assets to Pool** (HDT Page → Digital Assets Tab)
1. Upload new digital assets OR select from existing project files
2. Select asset type (3D Model, RTI [future], Image [future], etc.)
3. Each asset gets:
   - Auto-generated ID
   - Type specification
   - Optional title/description
4. Assets appear in "Digital Assets Pool" list

**Step 3: Create Scenes** (HDT Page → Scenes Tab)
1. Click "Create New Scene"
2. Enter name (e.g., "Conservation View")
3. Scene is created with empty asset list

**Step 4: Add Assets to Scene** (HDT Page → Scenes Tab)
1. Select scene from list
2. Click "Add Asset to Scene"
3. Choose from available assets in pool
4. Optionally set position/rotation/scale
5. Asset appears in scene's asset list

**Step 5: Configure Scene** (HDT Page → Scenes Tab)
1. Set one scene as default (loads first in viewer)
2. Configure environment (background color, ground, lighting)
3. Adjust asset transforms if needed

### Workflow 2: User Views 3D Content

**In Project Page 3D Viewer:**
1. Viewer fetches available scenes: `GET /api/projects/:projectId/scenes`
2. Loads default scene JSON file: `GET /api/projects/:projectId/scenes/overview.json`
3. Scene selector dropdown shows all available scenes
4. User selects different scene → fetches that scene's JSON file
5. ThreePresenter loads the SceneDescription (unchanged workflow)
6. Only assets in current scene are visible
7. Asset visibility/transforms respect scene configuration

## API Endpoints

### Digital Asset Pool Management

```
GET    /api/projects/:projectId/hdt
  → Returns full HDT document including metadata, digitalAssets[], and scenes[]

POST   /api/projects/:projectId/hdt/assets
  Body: { type, fileName, fileUrl, title, description, metadata }
  → Adds asset to pool, returns updated digitalAssets[]
  → Regenerates all scene JSON files (if asset used in scenes)

DELETE /api/projects/:projectId/hdt/assets/:assetId
  → Removes asset from pool (and from all scenes)
  → Regenerates all scene JSON files
  → Returns updated document
```

### Scene Management

```
GET    /api/projects/:projectId/scenes
  → Lists all available scenes (reads from scenes/ directory)
  → Returns: [{ id, name, fileName: 'overview.json' }]

GET    /api/projects/:projectId/scenes/:sceneId
  → Returns SceneDescription from scenes/{sceneId}.json file
  → Used by ThreePresenter

POST   /api/projects/:projectId/hdt/scenes
  Body: { name, description, isDefault }
  → Creates new scene in HDT metadata
  → Generates new scene JSON file in project_files/{projectId}/scenes/{sceneId}.json
  → Returns created scene

PUT    /api/projects/:projectId/hdt/scenes/:sceneId
  Body: { name?, description?, isDefault?, environment?, assets? }
  → Updates scene in HDT metadata
  → Regenerates scene JSON file
  → Returns updated scene

DELETE /api/projects/:projectId/hdt/scenes/:sceneId
  → Deletes scene from HDT metadata
  → Deletes scene JSON file
  → Returns success
```

### Scene Asset Management

```
POST   /api/projects/:projectId/hdt/scenes/:sceneId/assets
  Body: { assetId, position?, rotation?, scale?, visible? }
  → Adds asset reference to scene
  → Regenerates scene JSON file
  → Returns updated scene

PUT    /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
  Body: { position?, rotation?, scale?, visible? }
  → Updates asset properties in scene
  → Regenerates scene JSON file
  → Returns updated scene

DELETE /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
  → Removes asset from scene
  → Regenerates scene JSON file
  → Returns updated scene
```

### File Generation

Whenever HDT scenes are modified, the backend automatically:
1. Converts HDTScene → SceneDescription format
2. Writes to `project_files/{projectId}/scenes/{sceneId}.json`
3. ThreePresenter loads these files (no code changes needed)

## UI Changes

### HDT Page (Manager Only)

**Tab 1: Dublin Core** (ontology-based metadata)
- Title, description, creator, date, type, etc.

**Tab 2: CIDOC-CRM** (ontology-based metadata)
- Object type, time span, period, production, etc.

**Tab 3: Digital Assets** (project resources - UPDATED)
```
┌─────────────────────────────────────────┐
│ Digital Assets Pool                     │
│                                         │
│ [Upload New Asset] [Select from Files] │
│ Asset Type: [3D Model ▾] [RTI (future)]│
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📦 gargoyle.glb (15 MB) - 3D Model  │ │
│ │ Title: Gargoyle Front View          │ │
│ │ Used in: 2 scenes                   │ │
│ │ [Edit] [Remove]                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📦 base.obj (8 MB) - 3D Model       │ │
│ │ Title: Pedestal Base                │ │
│ │ Used in: 1 scene                    │ │
│ │ [Edit] [Remove]                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Tab 4: Scenes** (project resources - NEW)
```
┌─────────────────────────────────────────┐
│ Scenes                                  │
│                                         │
│ [Create New Scene]                      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🎬 Overview (default)               │ │
│ │ 2 assets                            │ │
│ │ [Edit] [Set Default] [Delete]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🎬 Conservation View                │ │
│ │ 1 asset                             │ │
│ │ [Edit] [Set Default] [Delete]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ When editing a scene:                   │
│ ┌─────────────────────────────────────┐ │
│ │ Scene: Overview                     │ │
│ │ Name: [Overview          ]          │ │
│ │ Description: [           ]          │ │
│ │                                     │ │
│ │ Assets in Scene:                    │ │
│ │ ☑ gargoyle.glb (3D Model)           │ │
│ │   Position: [0] [0] [0]             │ │
│ │   Rotation: [0] [0] [0]             │ │
│ │   [Remove from Scene]               │ │
│ │                                     │ │
│ │ ☑ base.obj (3D Model)               │ │
│ │   Position: [0] [-2] [0]            │ │
│ │   [Remove from Scene]               │ │
│ │                                     │ │
│ │ [+ Add Asset from Pool]             │ │
│ │                                     │ │
│ │ Environment:                        │ │
│ │ Background: [#404040]               │ │
│ │ ☑ Show Ground                       │ │
│ │                                     │ │
│ │ [Save] [Cancel]                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Project Page (3D Viewer)

**Before:** Single scene, asset management mixed

**After:** Scene selector, view-only mode
```
┌─────────────────────────────────────────┐
│ Scene: [Overview ▼]                     │
│         - Overview                      │
│         - Conservation View             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │       [3D Viewer Canvas]            │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Assets in current scene:                │
│ ☑ gargoyle.glb (3D Model)               │
│ ☑ base.obj                              │
│                                         │
│ [Annotations] [Settings]                │
└─────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Backend Schema & APIs
1. Add DigitalAsset, SceneAssetReference, HDTScene, HDTDocument types to `shared/types.ts`
2. Create HDTDocument interface in `backend/src/services/hdt-metadata.service.ts`:
   - Group ontology fields under `metadata: { dublinCore, cidocCrm }`
   - Initialize `digitalAssets: []` and `scenes: []` as project resources
   - Add helper function to generate SceneDescription JSON from HDTScene
3. Create scene file generation service:
   - `generateSceneFile(projectId, sceneId)` - converts HDTScene → SceneDescription JSON
   - Writes to `project_files/{projectId}/scenes/{sceneId}.json`
   - Called after any scene modification
4. Create new controller methods in `backend/src/controllers/hdt-metadata.controller.ts`:
   - Asset pool CRUD (with auto-regenerate scene files)
   - Scene CRUD (with auto-regenerate scene files)
   - Scene-asset association CRUD (with auto-regenerate scene files)
5. Add routes to `backend/src/routes/hdt-metadata.routes.ts`
6. Update/keep scene file routes in `backend/src/routes/projects.routes.ts`:
   - `GET /api/projects/:projectId/scenes` - list scenes
   - `GET /api/projects/:projectId/scenes/:sceneId` - get scene JSON file

### Phase 2: Frontend HDT Page
1. Update HDTPage types (HDTDocument instead of HDTMetadata)
2. Clearly label metadata tabs vs. resource tabs
3. Refactor Digital Assets tab to manage pool (multiple assets, with type selector)
4. Create new Scenes tab UI
5. Implement scene editor (add/remove assets, configure)

### Phase 3: Frontend Project Viewer
1. Add scene selector dropdown
2. Fetch available scenes: `GET /api/projects/:projectId/scenes`
3. Load scene JSON file: `GET /api/projects/:projectId/scenes/{sceneId}.json`
4. Pass SceneDescription to ThreePresenter (unchanged interface)
5. Update scene selection handling

### Phase 4: Documentation
1. Update SCENE_JSON_FORMAT.md to reflect HDT-based scene management
2. Update architecture docs
3. Document RDF/knowledge base integration plan for metadata
4. Create API documentation for new endpoints

## Data Flow

### Writing Flow (HDT Page → JSON Files)
```
Manager edits scene in HDT Page
  ↓
POST/PUT to /api/projects/:projectId/hdt/scenes/:sceneId
  ↓
Backend updates MongoDB hdt_collection.scenes[]
  ↓
Backend calls generateSceneFile(projectId, sceneId)
  ↓
Converts HDTScene + digitalAssets → SceneDescription
  ↓
Writes project_files/{projectId}/scenes/{sceneId}.json
  ↓
Returns success to frontend
```

### Reading Flow (Viewer → JSON Files)
```
User opens Project Page
  ↓
GET /api/projects/:projectId/scenes (list available scenes)
  ↓
GET /api/projects/:projectId/scenes/default.json (load default scene)
  ↓
ThreePresenter receives SceneDescription
  ↓
Renders 3D scene (unchanged)
```

## Open Questions

1. **Default Scene Creation:** When HDT is created, should we auto-create a "Default" empty scene?
   - **✅ DECISION:** Yes, create one empty scene called "Default"

2. **Asset Deletion:** When removing asset from pool, what happens to scenes using it?
   - **✅ DECISION:** Remove from all scenes automatically, show warning to user

3. **Scene Deletion:** Can user delete the last scene?
   - **✅ DECISION:** No, must have at least one scene (prevent deletion of last one)

4. **Asset Pool Limit:** Should we limit number of assets in pool?
   - **✅ DECISION:** No hard limit initially, could add later if needed

5. **Scene Limit:** Should we limit number of scenes?
   - **✅ DECISION:** No hard limit initially

6. **File Uploads:** Upload directly in HDT page or only select from existing?
   - **✅ DECISION:** Both - upload new OR select from project files

7. **Transforms in Viewer:** Can users adjust asset positions in viewer, or only in HDT page?
   - **✅ DECISION:** HDT page only (managers), viewer is read-only

## Success Criteria

- ✅ Clear conceptual separation: **metadata** (ontology-based) vs. **digital assets** (3D models, RTI, etc.)
- ✅ Project managers can manage ontology-based metadata (Dublin Core, CIDOC-CRM)
- ✅ Project managers can add multiple digital assets to project pool
- ✅ Asset pool extensible to multiple types (3D models now, RTI/images/video in future)
- ✅ Project managers can create multiple scenes per project/HDT
- ✅ Each scene can reference any assets from the pool
- ✅ Users can switch between scenes in the viewer
- ✅ Scene-specific asset transforms work correctly
- ✅ Clear UI separation: HDT page = manage (metadata + resources), Viewer = view
- ✅ Foundation ready for future RDF/knowledge base integration

## Next Steps

1. **Review this document** - confirm architecture makes sense
2. **Answer open questions** - get alignment on behavior (✅ ALL DECIDED)
3. **Implement Phase 1** - backend types and APIs
4. **Test APIs** - verify CRUD operations work
5. **Implement Phase 2** - frontend HDT page
6. **Implement Phase 3** - frontend viewer
7. **Test end-to-end** - complete workflows
