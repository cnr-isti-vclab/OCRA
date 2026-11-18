# 3D Viewer Wiring for Scene/Asset Annotation Scopes

Checklist of work needed in the **3D** path so scene/asset-scoped annotations behave like the **2D** (OpenLIME) path.

Shared UI and store already support scopes on both modes. What is missing is **viewer-side** coordinate remap, paint filtering, and creation-time asset focus in `Viewer3DPanel` / ThreePresenter.

## Status

| Layer | 2D (OpenLIME) | 3D (ThreePresenter) |
| ----- | ------------- | ------------------- |
| Workbench scope pickers (`scene` / `asset`) | Yes | Yes (same UI) |
| Scope chips on data/geometry lists | Yes | Yes (same UI) |
| Browse **Geometry scope** filter (`All` / `Scene` / asset) in panel | Yes | UI yes; **paint filter not wired** |
| Create/edit/draw in **scene space** | Yes (`coordinateSpace: 'scene'`) | Coordinates treated as viewer/scene picks today; **no asset-local remap** |
| Persist/load asset-scoped shapes in **asset space** | Yes (`annotationPlacementTransform`) | **Not implemented** |
| Skip painting asset geometry when asset absent from scene | Yes | **Not implemented** |
| Creation focus: hide other assets when scope = one asset | Yes (`setFocusedAssetInstances`) | **Not implemented** |
| Single-asset scene still applies model placement matrix | Yes (always `SceneSession.open`) | Placement already on models; annotations **do not** follow asset frame |

Related docs: [`a07-annotation-creation.md`](./a07-annotation-creation.md), [`a00-annotation-model.md`](./a00-annotation-model.md), [`reference-frames.md`](./reference-frames.md), [`annotation-current-status.md`](./annotation-current-status.md).

## Mental model (same as 2D)

- **Scene-scoped geometry** (`referenceType: 'scene'`): vertices live in **scene coordinates**. Draw/edit/display in scene space; store as-is.
- **Asset-scoped geometry** (`referenceType: 'asset'`): vertices are stored in that asset’s **local space**. Convert to scene space for display/edit in a given scene; convert back to asset space on persist. If the asset is not in the current scene, do not paint it.
- **Data visibility** (`visibilityType` / `visibilityId`) is independent of geometry reference. Mixed links are allowed; do **not** filter panel data with the geometry-scope browse filter.
- **Browse filter** affects only which geometries are painted/selectable in the viewer.
- **Creation focus** is separate: while the workbench scopes to an asset, hide other models so the user can match menu ↔ rendered asset.

2D reference implementation:

| Concern | Path |
| ------- | ---- |
| Scene ↔ asset-image remap | `frontend/src/adapters/annotation-store/annotationPlacementTransform.ts` |
| Paint filter + creation focus | `frontend/src/routes/components/Viewer2DPanel.tsx` |
| OpenLIME scene coords + instance enable | `frontend/src/adapters/openlime-viewer/OpenLIMEViewer.tsx` (`coordinateSpace: 'scene'`, `setFocusedAssetInstances`) |
| Filter helpers | `frontend/src/utils/geometryScopeFilter.ts` |
| Scope chip / panel filter UI | `AnnotationScopeChip`, `AnnotationGeometryScopeFilter` (shared; already mounted for 3D host) |

## Work items for 3D

### 1. Asset placement frame helper (3D)

Mirror the 2D `LayerImageFrame` idea for Three.js / scene models:

- Read each scene model’s placement (`position`, `rotation`, `scale`, `rotationUnits`) from `SceneDescription`.
- Provide `transformPointAssetLocalToScene` / `transformPointSceneToAssetLocal` (and shape-level mappers) using the same composition rules as model loading in ThreePresenter.
- Prefer extending or paralleling `annotationPlacementTransform.ts` with a **3D** variant (or shared math + dimension-specific frame readers) to avoid a second divergent policy.

**Done when:** unit tests round-trip a point through a translated/rotated/scaled model frame.

### 2. Persist / load remap in `Viewer3DPanel`

On create/update of asset-scoped geometry:

- Viewer emits scene-space vertices (picks are in the shared 3D scene).
- Before store/API: map shapes → asset local (`transformShapesSceneToAssetLocal`).

On paint/sync from store:

- Asset-scoped: map asset local → scene before `activeGeometriesToViewerAnnotations` / `renderAnnotations`.
- If `!sceneHasAsset(sceneDesc, referenceId)`, omit the geometry (same as 2D).
- Scene-scoped: pass through unchanged.

**Done when:** the same asset-scoped annotation appears correctly placed in two scenes with different model placements; removing the asset from a scene hides those geometries there.

### 3. Browse geometry-scope filter (paint only)

`geometryScopeFilter` already lives in `AnnotationStoreContext` and the panel UI works in 3D mode.

Wire in `Viewer3DPanel` (same rules as 2D):

- `all` → no extra filter
- `scene` → only `referenceType === 'scene'`
- `asset:<id>` → only that asset’s geometries
- If the selected asset is not in the current scene, treat as `all` (or reset)

Do **not** filter `activeData` / panel lists with this control.

**Done when:** changing the panel select changes which 3D annotations are rendered, independently of class filter and link-view.

### 4. Creation-time asset focus

When the creation wizard is active and the **current step’s** scope is an asset:

- Geometry step → `creationDraft.geometryScope`
- Data step → `creationDraft.dataVisibility`

Behaviour (match 2D):

| Scope | Models | Painted geometries |
| ----- | ------ | ------------------ |
| `scene` | All visible (restore prior visibility) | No creation override (`all`) |
| `asset X` | Only model `X` visible | Only geometries for `X` |

Needs a ThreePresenter / `ThreeJSViewer` API analogous to OpenLIME `setFocusedAssetInstances` (e.g. snapshot + set model visibility by scene model id, restore on cleanup). Apply from a `useEffect` in `Viewer3DPanel`; restore when leaving creation or switching back to scene scope.

**Done when:** multi-model scenes isolate the chosen asset during create; closing the workbench restores previous visibility.

### 5. ThreePresenter constraints (keep module-clean)

Per `AGENTS.md`: changes inside `frontend/three-presenter` must stay self-contained (no OCRA imports). Prefer:

- generic visibility / matrix APIs on the presenter, and
- OCRA-specific scope policy in `Viewer3DPanel` / `adapters/three-presenter/`.

Document any new presenter APIs in the submodule’s own docs.

## Suggested order

1. 3D frame math + unit tests  
2. Persist/load remap + “asset not in scene” paint skip  
3. Browse geometry-scope filter in `Viewer3DPanel`  
4. Creation focus (model visibility API + effect)

Items 3–4 are mostly wiring once (1)–(2) exist; (4) can ship without remap but is confusing if asset-scoped draws are still in the wrong frame.

## Explicitly out of scope for this checklist

- Full HDT reference-frame redesign ([`reference-frames.md`](./reference-frames.md)) — this checklist is the pragmatic 2D-parity wire.
- Migrating legacy 2D scene-scoped rows stored in first-layer image space.
- Changing the shared workbench/panel UX (already scope-aware).
- 3D-only features unrelated to scope (e.g. area fill quality); see `annotation-current-status.md`.

## Manual check (after wiring)

- [ ] Multi-asset 3D scene: create **scene**-scoped point → stays fixed when an asset is moved in structuring (if applicable) / aligns with scene annotations in 2D of the same HDT where comparable  
- [ ] Create **asset**-scoped point on asset A → moves with A’s placement across scenes  
- [ ] Geometry scope filter: All / Scene / each asset  
- [ ] Create with asset scope: other models hidden; Done/cancel restores them  
- [ ] Asset removed from scene: its asset-scoped geometries no longer painted there; mixed links handled as today on the backend  

---

*Added for 2D scene-coordinate / scope work parity tracking.*
