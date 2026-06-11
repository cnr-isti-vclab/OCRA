# OCRA Reference Frames for HDTs, Scenes, Assets, and Annotation Geometry

This document proposes a canonical reference-frame model for OCRA HDTs, scenes, assets, and annotation geometry.
It is intended as a design document for a future implementation deliverable.

OCRA is currently under active development, so this proposal favors a clean and coherent model over backward-compatible extensions.

## Status

This is a proposal, not yet the implemented canonical storage format.

Today, OCRA already stores asset placement information in scenes, but it does so using a viewer-oriented flat transform model:

- 3D scenes use asset-level `position`, `rotation`, and `scale`
- 2D scenes also reuse the same fields, but OpenLIME only supports a planar subset of those transforms
- annotation geometry is expressed in viewer coordinates, without a first-class reference-frame model shared with scene assets

In the current implementation, the result is workable for current features, but the conceptual model is incomplete:

- HDT-level shared frames do not yet exist as first-class entities
- scene frames are still implicit in flat asset transforms
- asset-local coordinates and scene coordinates are not clearly separated
- 2D and 3D adapters enforce different transform rules
- annotation geometry does not yet have a canonical anchoring model shared with scene asset placement

This proposal addresses that gap.

## Goals

The reference-frame system should:

- define HDT-level shared coordinates explicitly
- define scene coordinates explicitly, rather than implicitly through viewer adapters
- work for both 3D and 2D scenes
- support both minimal scenes with a single asset and complex spatial reconstructions with many distributed assets
- allow hierarchical frames
- allow multiple scenes of the same HDT to share a common spatial basis
- provide a canonical basis for asset placement
- provide a canonical basis for annotation geometry anchoring
- make viewer-specific constraints explicit and validated
- keep camera/view state separate from scene structure

## Non-Goals

This proposal does not define:

- camera persistence
- rendering configuration details
- a complete migration plan for all existing scene JSON payloads
- a full annotation data-model redesign

Those topics depend on this model, but are separate concerns.

## Conceptual Model

The core idea is that OCRA should describe spatial structure as a graph of reference frames plus placements of assets and geometries within those frames.

There are four different concerns:

1. HDT structure: shared frames that belong to the HDT as a whole.
2. Scene structure: scene-local frames and their parent-child relationships.
3. Scene content placement: where an asset is placed within a scene-local frame.
4. Geometry anchoring: which frame an annotation geometry is expressed in.

These concerns should not be merged.

## Reference Frames

A reference frame is a named coordinate system defined relative to another reference frame.

Examples:

- the root scene frame
- a wall frame
- a table frame
- a reconstructed object frame
- a document page frame
- a 2D imaging plane frame

Frames are semantic and structural. They are not viewer state.

## HDT Frames and Scene Frames

The proposal distinguishes two structural levels:

- HDT-level frames, shared across scenes of the same HDT
- scene-local frames, owned by a specific scene

In this proposal, the HDT spatial layer is 3D by definition.
It represents the global spatial basis of the documented object or environment.
Planar behavior is introduced only at the scene level, or in local frames that represent planar supports such as walls, panels, pages, or RTI/image-aligned surfaces.

This distinction matters because not all scenes are equal.

Some scenes are:

- local working views
- partial reconstructions
- 2D documentary compositions
- alternative alignments of the same assets

At the same time, several scenes may still need to refer to a shared global basis, such as:

- the physical object reference system
- a reconstruction-wide origin
- a museum installation layout
- a retable, manuscript, wall, or architectural reference system

For that reason, OCRA should not treat the top-level spatial origin as necessarily scene-local.
Instead, it should support a shared HDT-level frame graph and allow scenes to attach to it.

## Why a Frame Graph Is Better Than Flat Asset Transforms

The current flat model is sufficient only when every asset is placed directly in a single implicit scene coordinate system.

That becomes limiting when:

- multiple assets belong to the same physical support
- assets need to be aligned relative to a shared wall, panel, or object surface
- annotations should survive asset replacement or re-registration
- 2D and 3D viewers need a common model
- scene semantics matter, not just raw display transforms

With a frame graph:

- shared local contexts become explicit
- shared HDT-wide contexts become explicit
- transforms can be composed structurally
- placement logic is separated from asset identity and remains scene-owned
- annotation geometry can attach to meaningful frames instead of incidental viewer coordinates

## Proposed Canonical Transform Type

The proposed canonical transform for HDT frames, scene frames, and asset placements is a 3D similarity transform:

```ts
type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // [x, y, z, w]

type SimilarityTransform3 = {
  translation: Vec3;
  rotation: Quat;
  scale: number;
};
```

This means:

- translation is always 3D
- rotation is always stored as a quaternion
- scale is uniform and positive

The quaternion component order is `[x, y, z, w]`.
This matches the convention used by Three.js and makes `[0, 0, 0, 1]` the identity rotation.

## Units and Geometric Scale

The spatial model should distinguish clearly between:

- unit of measurement
- geometric scale

These are related mathematically, but they do not express the same concept.

A unit of measurement describes the metric meaning of coordinates in a spatial context.
Examples:

- an HDT may use meters to contextualize an object inside a church
- a study scene may use millimeters for fine inspection and measurement

Geometric scale, instead, is part of a transform.
It describes how one frame is geometrically transformed relative to another.

For this reason, unit conversion should not be conceptually merged with ordinary geometric scaling, even if both operations introduce a multiplicative factor.

The recommended interpretation is:

- `unit` is semantic metadata attached to a spatial context
- `scale` is a geometric transform component
- changing unit systems may result in a conversion factor in the composed transform, but that factor should be understood as unit conversion, not as arbitrary resizing

This distinction matters because:

- measurements should remain meaningful and auditable
- scene editing should not confuse metric conversion with visual or geometric deformation
- the same object may be contextualized globally in meters and studied locally in millimeters without changing its semantic identity

## Transform Composition

The reference-frame model is useful only if transform composition is explicit and predictable.

At a high level, every effective placement is obtained by composing transforms along the relevant chain:

- from the asset intrinsic space to the chosen scene-local frame
- from the scene-local frame to its parent scene frame, if any
- from the scene root to the attached HDT frame, if the scene is registered into the HDT
- from that HDT frame up to the HDT root

Conceptually, if an asset is placed in a scene-local frame, the effective transform to the global HDT space is:

```ts
assetToHdt =
  assetToSceneFrame
  * sceneFrameToParent
  * ...
  * sceneRootToHdtFrame
  * hdtFrameToParent
  * ...
  * hdtRoot
```

To avoid ambiguity, OCRA should adopt the following mathematical convention.

Each `transformToParent` maps coordinates from a child frame to its parent frame.
Given a point `p_child` expressed in the child frame, the corresponding point in the parent frame is:

```txt
p_parent = t + s R p_child
```

where:

- `t` is the translation vector expressed in the parent frame
- `R` is the rotation from child frame to parent frame
- `s` is the positive uniform scale

This means:

- scale is applied in the child-local frame
- rotation is applied in the child-local frame
- translation is applied last and is expressed in the parent frame

The document assumes a consistent parent-relative composition model:

- each frame stores its transform to its parent
- each asset placement stores its transform to its owning scene frame
- global coordinates are obtained by walking upward through the graph and composing all parent-relative transforms

If a transform from frame `C` to frame `B` is written as:

```txt
T_CB(p) = t_CB + s_CB R_CB p
```

and a transform from frame `B` to frame `A` is written as:

```txt
T_BA(p) = t_BA + s_BA R_BA p
```

then the composed transform from `C` to `A` is:

```txt
T_CA = T_BA ∘ T_CB
```

which means:

```txt
T_CA(p) = T_BA(T_CB(p))
```

and yields:

```txt
s_CA = s_BA s_CB
R_CA = R_BA R_CB
t_CA = t_BA + s_BA R_BA t_CB
```

This is the composition rule that OCRA should use throughout the reference-frame system.
It is also compatible with the 2D transform semantics currently used by OpenLIME.

This has several practical consequences:

- moving a parent frame moves all of its descendants
- a scene can be re-registered in the HDT space by changing only the transform of its root frame
- a shared HDT frame can be reused across scenes while each scene keeps its own local working frames
- measurements and geometry exports can be computed in either local or global coordinates by choosing how far composition is evaluated

For planar 2D scenes, the same logic still applies.
The difference is only that the allowed transforms are constrained to the planar subset.

## Why Similarity Transform Instead of a General Affine Transform

The proposal intentionally excludes:

- non-uniform scale
- shear
- arbitrary 4x4 matrices as canonical storage

Reasons:

- OpenLIME already behaves as a uniform-scale planar system
- scene-frame semantics become harder to reason about with arbitrary affine transforms
- composition and validation remain simpler
- annotation geometry behaves more predictably
- the model stays compatible with both 3D viewers and 2D viewers

If a future requirement truly needs arbitrary affine transforms, that should be introduced as a deliberate extension, not as the default canonical model.

## Proposed Spatial Model

### HDT Frame

```ts
type HdtFrame = {
  id: string;
  label: string;
  parentFrameId?: string;
  transformToParent: SimilarityTransform3;
};
```

Semantics:

- `id` is stable and unique within the HDT
- `label` is user-facing
- `parentFrameId` defines the HDT-level frame graph
- `transformToParent` maps coordinates from the frame to its parent

For the root HDT frame, `transformToParent` is still present by convention, but it must be the identity transform.
This keeps serialization regular while avoiding a special-case shape for the root.

The root HDT frame is the shared global basis for the HDT.
It may be named `hdt-origin` by convention, but the name itself is not semantically important.
HDT frames belong to the global 3D spatial layer and are not themselves classified as `planar2d`.

### Scene Frame

```ts
type FrameConstraint = 'free3d' | 'planar2d';

type SceneFrameBase = {
  id: string;
  label: string;
  transformToParent: SimilarityTransform3;
  constraint?: FrameConstraint;
};

type SceneFrame =
  | (SceneFrameBase & {
      parentFrameId: string;
      parentHdtFrameId?: never;
    })
  | (SceneFrameBase & {
      parentHdtFrameId: string;
      parentFrameId?: never;
    })
  | (SceneFrameBase & {
      parentFrameId?: never;
      parentHdtFrameId?: never;
    });
```

Semantics:

- `id` is stable and unique within the scene
- `label` is user-facing
- `parentFrameId` defines the scene-local frame graph
- `parentHdtFrameId` allows a scene-local frame to attach directly to a shared HDT frame
- `transformToParent` maps coordinates from the frame to its parent
- `constraint` declares which transform subset is valid in that frame

If `constraint` is absent, the frame is unconstrained and should be treated as equivalent to `free3d`.

A scene frame must reference exactly one parent source:

- another scene frame, through `parentFrameId`
- or an HDT frame, through `parentHdtFrameId`
- or no parent, only if it is the scene root and the scene is purely local

In TypeScript this exclusivity can be expressed directly as a union, as shown above.
Equivalent runtime validation can also be enforced in shared schemas such as Zod definitions.

### Asset Placement

```ts
type SceneAssetPlacement = {
  assetId: string;
  sceneFrameId: string;
  transformInFrame: SimilarityTransform3;
  visible?: boolean;
};
```

Semantics:

- `assetId` identifies the digital asset
- `sceneFrameId` identifies the scene-local frame where the asset is placed
- `transformInFrame` maps asset-local coordinates to the chosen scene-local frame
- `visible` remains a scene-level presentation property

Asset placements are always owned by a scene.
An asset is never placed directly in the HDT spatial layer.
If a scene wants to reuse an HDT frame, it should define a local scene frame derived from that HDT frame, often with identity transform.
This keeps asset placement semantics aligned with scene interaction mode and scene-level validation.

### Scene Description Skeleton

```ts
type UnitLength = 'mm' | 'cm' | 'm';

type SceneCoordinateProfile = 'free3d' | 'planar2d';

type SceneDescriptionV2 = {
  id: string;
  label: string;
  coordinateProfile: SceneCoordinateProfile;
  unit?: UnitLength;
  rootSceneFrameId: string;
  frames: SceneFrame[];
  assetPlacements: SceneAssetPlacement[];
};
```

This is intentionally focused on scene structure and placement.
Rendering options, environment settings, and viewer state should remain separate sections.

`coordinateProfile` is a scene-level summary of the intended interaction model.
It does not redefine the HDT spatial layer.
In particular, a `planar2d` scene is still registered inside the global 3D HDT space through one or more local planar frames.
This distinction matters because `coordinateProfile` affects how asset placements in that scene are interpreted and validated, while the HDT layer remains only the shared global reference system.
Its purpose is not to replace frame-level constraints, but to express the operational mode of the scene as a whole.

`unit` declares the intended measurement unit of the scene.
If omitted, it should inherit from the HDT spatial model.
This allows a scene to adopt a more convenient unit system for study or interaction without changing the meaning of the shared HDT spatial layer.

In practice, `coordinateProfile` can be used to:

- select the appropriate viewer mode, such as planar 2D interaction versus free 3D interaction
- define the expected editing and navigation behavior of the scene
- enable scene-level validation rules that apply to the whole composition
- classify the scene explicitly without having to infer its intent only from the frame graph

The frame graph remains the geometric source of truth.
`coordinateProfile` is a scene-level declaration about how that geometry is intended to be used.

In this proposal, `assetPlacements` is keyed effectively by `assetId` within a scene.
That means a scene may contain at most one placement for a given asset.
If OCRA later needs multiple placements of the same asset inside one scene, the model should introduce an explicit `placementId` rather than overloading `assetId`.

### HDT Description Skeleton

```ts
type HdtSpatialModel = {
  rootHdtFrameId: string;
  unit: UnitLength;
  frames: HdtFrame[];
};

type HdtDocumentSpatialDescription = {
  spatialModel: HdtSpatialModel;
  scenes: SceneDescriptionV2[];
};
```

This makes the ownership boundary explicit:

- HDT frames belong to the HDT aggregate
- scene frames belong to one scene
- asset placements belong to one scene
- assets participate in an HDT only through their placement inside one or more scenes

The HDT `unit` should be treated as the canonical global measurement unit of the project spatial layer.

## Example

```ts
const scene = {
  id: 'scene-01',
  label: 'North Wall Documentation',
  coordinateProfile: 'planar2d',
  rootSceneFrameId: 'scene-origin',
  frames: [
    {
      id: 'scene-origin',
      label: 'Scene Origin',
      parentHdtFrameId: 'hdt-origin',
      transformToParent: {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: 1,
      },
      constraint: 'planar2d',
    },
    {
      id: 'wall-01-frame',
      label: 'Wall 01',
      parentFrameId: 'scene-origin',
      transformToParent: {
        translation: [10, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: 1,
      },
      constraint: 'planar2d',
    },
  ],
  assetPlacements: [
    {
      assetId: 'asset-rti-01',
      sceneFrameId: 'wall-01-frame',
      transformInFrame: {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: 1,
      },
      visible: true,
    },
  ],
};
```

## Coordinate Semantics

The proposal distinguishes clearly between the following coordinate domains:

- asset-local coordinates
- HDT-frame coordinates
- scene-frame coordinates
- scene-root coordinates
- viewer coordinates
- image/pixel coordinates

Only the first four belong in the canonical spatial model.

Viewer coordinates and pixel coordinates are adapter-level concerns.

## Asset-Local Coordinates

Each asset has its own intrinsic coordinate system.

Examples:

- a 3D mesh has vertex coordinates in model space
- an RTI/image asset has image-domain coordinates
- a derived layer may have its own raster coordinate system

The spatial model should not redefine those intrinsic coordinates.
Instead, each scene places the asset-local coordinate system into one of its own scene-local frames.

## Annotation Geometry Anchoring

The same reference-frame model should be reused for annotation geometry, but with a different scope from scene asset placement.
As described in the annotation model, annotation geometry lives in the reference space of a scene or of a digital asset, not directly in the HDT spatial layer.

The key distinction is between:

- the owning scope of the geometry resource
- the internal frame graph used by scenes and assets for their own spatial organization

This matches the current annotation model in `doc/a00-annotation-model.md`, where `referenceType` and `referenceId` identify the owning scene or asset of the geometry record itself.
They do not currently identify a sub-frame inside that scene or asset.

A future geometry anchoring structure should look conceptually like this:

```ts
type GeometryAnchorRef =
  | { scope: 'scene'; sceneId: string }
  | { scope: 'asset'; assetId: string };

type GeometryAnchor = {
  reference: GeometryAnchorRef;
};

type Geometry3D = {
  anchor: GeometryAnchor;
  vertices: Vec3[];
};
```

This means:

- annotation geometry is always owned by a declared scene or asset scope
- geometry does not depend on transient viewer state
- geometry can remain stable across viewer adapters
- geometry can attach either to a scene reference space or to an asset reference space, depending on the use case

The exact annotation schema can be defined later, but it should reuse the same frame identity system.
For scene-scoped geometry, the current proposal assumes that coordinates are expressed directly in scene coordinates.
In this document, "scene coordinates" means the coordinate system of the scene root frame.
That is the natural reference space for scene-level geometry because the scene root is the unique frame that defines the scene spatial basis within the HDT.
For asset-scoped geometry, the current proposal assumes that coordinates are expressed directly in the intrinsic asset space.

This is also an intentional refinement of the current annotation model.
Today, annotation geometry is scoped by `referenceType: 'scene' | 'asset'` plus a `referenceId` that identifies the owning scene or asset.
For now, that remains sufficient: scene geometry is expressed in scene coordinates, and asset geometry is expressed in intrinsic asset coordinates.

This is still an improvement over the current flat shape.
The discriminated union makes the two scopes structurally distinct, `sceneId` and `assetId` are typed separately instead of being conflated into a single `referenceId`, and the canonical shape is ready to evolve cleanly if sub-scene frame anchoring is needed later.

In practical terms, the current OCRA/OpenLIME direction suggests the following interpretation:

- geometry with scene scope is expressed in scene coordinates
- geometry with asset scope is expressed in the intrinsic coordinate space of the asset
- for 2D assets such as RTI datasets and images, the intrinsic asset space is typically the local image or layer space used by the viewer
- for 3D assets, the intrinsic asset space is typically the model space of the mesh

This is important because it suggests that OCRA may not need a heavy shared abstraction for intrinsic asset spaces immediately.
At the current stage, scene scope and asset scope may already be sufficient, provided that each asset type documents clearly what its intrinsic coordinate space means.

## 2D and 3D Profiles

The proposal supports both 3D and 2D scenes through explicit constraints.
The HDT spatial layer remains 3D; the planar profile applies to scenes and scene-local frames that represent planar supports or planar interaction spaces.

### `free3d`

The `free3d` profile allows:

- any 3D translation
- any unit quaternion rotation
- any positive uniform scale

This profile is appropriate for:

- reconstructed 3D scenes
- objects placed in open 3D space
- general-purpose 3D composition

### `planar2d`

The `planar2d` profile is a constrained subset of the 3D transform model.

It allows:

- translation only in the XY plane
- rotation only around the Z axis
- positive uniform scale

It forbids:

- translation along Z
- tilt around X
- tilt around Y
- non-uniform scale

This profile is appropriate for:

- RTI scenes
- image-aligned documentary scenes
- layered 2D acquisition products
- wall planes, manuscript pages, and other planar supports

## Validation Rules

The scene model should be validated structurally and geometrically.

### General Validation

- `rootHdtFrameId` must exist in HDT `frames`
- `unit` must be declared on the HDT spatial model
- `rootSceneFrameId` must exist in scene `frames`
- every `hdtFrame.id` must be unique within the HDT
- every `frame.id` must be unique within the scene
- an id should not be reused ambiguously across HDT and scene scopes if global lookup APIs are introduced
- every `parentFrameId` must reference an existing frame
- every `parentHdtFrameId` must reference an existing HDT frame
- a scene frame must not define both `parentFrameId` and `parentHdtFrameId`
- the frame graph must be acyclic
- every `assetPlacements[].assetId` must reference an existing asset
- every `assetPlacements[].sceneFrameId` must reference an existing scene-local frame
- every quaternion must be finite and non-zero
- every quaternion should be normalized during validation or canonicalization
- every scale must be finite and strictly greater than zero

If a scene declares a different `unit` from the HDT unit, the implementation must treat the difference as a metric conversion between coordinate systems, not as an arbitrary scene deformation.

### Root Frame Validation

The root HDT frame should be canonicalized as identity:

- `translation = [0, 0, 0]`
- `rotation = [0, 0, 0, 1]`
- `scale = 1`

This avoids ambiguity about what the global spatial basis means.

A scene root does not need to be identity if it is registered relative to an HDT frame.
That transform is precisely what expresses where the scene sits in the HDT spatial system.

### `planar2d` Validation

For a frame or placement constrained as `planar2d`:

- `translation[2]` must be `0` within a configured tolerance
- rotation must represent only a Z-axis rotation within a configured tolerance
- scale must be positive

In practice, validation should likely use numerical tolerances rather than exact equality.

Example tolerance policy:

- `abs(z) <= 1e-9` for planar translation checks
- quaternion components corresponding to X and Y tilt near zero within tolerance

### Composition Validation

If a child frame is declared `planar2d`, its effective transform chain within the scene-local graph should also remain planar relative to the scene root.

This means OCRA should reject or normalize cases where:

- a planar child is attached under a tilted 3D parent
- a nominally 2D scene becomes effectively non-planar through composition

This rule matters because local validation alone is not enough.
A transform may be locally planar but effectively non-planar relative to the scene root if its scene-local ancestors are not.

The important scope boundary is this:

- `planar2d` composition validation applies inside the scene-local frame graph
- the scene root transform into HDT space may still include arbitrary 3D orientation

This is necessary because the scene root attachment is exactly what allows a planar scene to be positioned on an arbitrarily oriented support in the global 3D HDT layer, such as an inclined wall, a retable panel, or an architectural surface.

## Canonicalization Rules

To keep data stable and diff-friendly, OCRA should canonicalize transforms on write.

Suggested canonicalization:

- normalize quaternions
- map nearly-zero numeric noise to exact zero when safe
- canonicalize root HDT frame identity
- canonicalize positive scale values
- reject `-0` style output in serialized JSON if possible

Canonicalization should make equivalent transforms serialize the same way whenever practical.

## Relationship With OpenLIME

OpenLIME already uses an explicit coordinate-system pipeline internally:

- scene coordinates
- layer coordinates
- image coordinates
- viewport coordinates

It also uses a 2D transform model with:

- translation in `x` and `y`
- rotation angle `a`
- uniform scale `z`

This proposal is compatible with that design.

In the OCRA adapter:

- a `planar2d` scene frame chain can be projected to OpenLIME's planar transform
- an asset placement can be converted into the corresponding OpenLIME layer transform
- asset image coordinates remain separate from scene coordinates

This is important because OCRA should not expose OpenLIME's internal 2D transform shape as the canonical scene model.
OpenLIME should be treated as one viewer adapter, not as the domain model.

## Relationship With three-presenter

The proposed OCRA transform semantics are also compatible with `three-presenter`, and therefore with the standard local-transform model of Three.js.

In practice, `three-presenter` applies model transforms through:

- local position
- local rotation
- local scale

This corresponds to the standard Three.js local object transform, where a child object is transformed relative to its parent.
That is compatible with the OCRA convention adopted in this document:

```txt
p_parent = t + s R p_child
```

and with the parent-relative composition rule:

```txt
T_CA = T_BA ∘ T_CB
```

Therefore, an OCRA frame graph can be adapted naturally to a Three.js scene graph:

- each OCRA frame corresponds conceptually to a local transform relative to its parent
- each asset placement corresponds conceptually to a local transform relative to its owning scene frame
- global coordinates are obtained by composing local transforms upward through the hierarchy

Two implementation notes are important:

### Rotation Representation

The OCRA proposal uses quaternions as the canonical persisted representation for rotation.
By contrast, `three-presenter` currently exposes model rotations mainly as Euler triples.

This does not create a mathematical incompatibility, but it does mean that:

- OCRA can keep quaternions as the canonical format
- the `three-presenter` adapter may need to convert quaternions to Euler angles for current APIs
- a future refinement could apply quaternions directly in the Three.js layer for closer alignment with the canonical model

### Model Origin Handling

`three-presenter` also exposes an `origin` behavior such as `model_coord` versus `model_center`.
This is useful in practice, but it is not the same thing as a canonical frame transform in the OCRA reference-frame model.

In particular:

- `model_coord` is naturally compatible with the idea that the asset keeps its intrinsic reference space
- `model_center` behaves more like a viewer-side or import-side normalization convenience

For this reason, origin-normalization options in `three-presenter` should be understood as adapter behavior or explicit derived transforms, rather than as the definition of the canonical asset reference space itself.

## Relationship With the Current OCRA Scene Model

Today, OCRA persists scene asset placement using flat fields such as:

- `position`
- `rotation`
- `scale`

That format is useful as a temporary storage and adapter shape, but it is not expressive enough to model:

- shared HDT-level reference frames
- named scene-local frames derived from shared HDT frames
- hierarchical frame composition
- canonical geometry anchoring
- explicit 2D profile constraints

For this reason, the current flat placement format should be considered transitional.
More specifically, the current scene schema still represents rotation as Euler angles and still allows scale shapes that are broader than the proposed canonical model.
The proposal in this document deliberately narrows that shape to quaternions plus positive uniform scale so that frame composition remains mathematically unambiguous across 2D and 3D viewers.

Scene-level presentation metadata such as `isDefault` is not part of the spatial model itself.
It should remain in the broader HDT document structure as scene metadata, outside the canonical spatial fields described by `SceneDescriptionV2`.

## Why Quaternions in Canonical Storage

Quaternions are proposed for canonical storage because they:

- avoid Euler-angle ambiguity
- compose cleanly
- work naturally in 3D and in constrained 2D subsets
- reduce the need for unit flags such as `deg` versus `rad`

Euler angles may still be exposed in editing UIs for usability, but they should not be the canonical persisted representation.

## Why Uniform Scale Only

Uniform scale is proposed because it keeps frame semantics simple.

A reference frame is easier to interpret when it preserves angles and relative proportions.
That matters for:

- geometry reuse
- annotation stability
- predictable coordinate composition
- interoperability between 2D and 3D adapters

If a specific asset needs non-uniform deformation, that should be treated as an exceptional asset-specific rendering concern, not as the default scene-frame language.

This choice is compatible with explicit measurement units.
If a scene uses millimeters and the HDT uses meters, the resulting factor in the composed transform should be interpreted as a unit conversion between coordinate systems, not as arbitrary geometric distortion.

## Recommended Implementation Direction

When OCRA implements this proposal, the preferred direction is:

1. introduce canonical frame and placement types in shared schema
2. distinguish HDT frames from scene-local frames in that schema
3. validate them in backend and shared runtime schemas
4. adapt 3D and 2D viewers from the canonical model
5. keep old flat transform fields only as temporary derived compatibility data if needed
6. align annotation geometry anchoring with the same reference-system concepts, while preserving its scene-or-asset scope

This order keeps the architecture coherent and avoids maintaining parallel scene models longer than necessary.

## Open Questions

The following decisions should be resolved in the implementation deliverable:

- whether asset placements should allow optional per-placement metadata such as confidence, provenance, or registration method
- whether OCRA should preserve some technical helper frames produced by calibration, registration, or photogrammetry pipelines when those frames are stable and useful across scenes, or keep such pipeline-specific frames outside the core scene model
- whether OCRA should model the intrinsic reference space of each asset explicitly as a common concept, or keep those details specific to each asset type such as 3D meshes, RTI datasets, and images

At the moment, this last point may no longer be a true open question in the short term.
The current annotation model already distinguishes scene-scoped and asset-scoped geometry, and the current OpenLIME integration already behaves as if 2D asset geometry lives in the local image/layer space of the dataset.
Because of that, a reasonable near-term implementation choice is:

- keep the concept of asset-scoped geometry explicit
- keep the detailed definition of intrinsic asset coordinates asset-type-specific
- defer any attempt to introduce a single unified `AssetReferenceSpace` abstraction until a concrete cross-type need appears

## Example: HDT in Meters, Study Scene in Millimeters

Consider a retable documented in a global HDT spatial model used to contextualize it on the altar of a church.
At the HDT level, meters may be the most appropriate unit because the object is related to a larger architectural environment.

A separate 2D study scene may instead use millimeters because:

- it focuses on close inspection
- it needs fine-grained measurements
- its interaction tools benefit from a smaller unit

Conceptually:

- the HDT spatial model uses `unit: 'm'`
- the study scene uses `unit: 'mm'`
- the study scene is still registered to the same HDT frame graph
- the difference in unit is interpreted as metric conversion, not as arbitrary resizing of the object

For example:

```ts
const hdtDocumentSpatialDescription = {
  spatialModel: {
    rootHdtFrameId: 'hdt-origin',
    unit: 'm',
    frames: [
      {
        id: 'hdt-origin',
        label: 'HDT Origin',
        transformToParent: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
      {
        id: 'retable-frame',
        label: 'Retable',
        parentFrameId: 'hdt-origin',
        transformToParent: {
          translation: [2.5, 0.8, 1.2],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
    ],
  },
  scenes: [
    {
      id: 'retable-study-scene',
      label: 'Retable Study',
      coordinateProfile: 'planar2d',
      unit: 'mm',
      rootSceneFrameId: 'scene-root',
      frames: [
        {
          id: 'scene-root',
          label: 'Scene Root',
          parentHdtFrameId: 'retable-frame',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'study-plane',
          label: 'Study Plane',
          parentFrameId: 'scene-root',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
      ],
      assetPlacements: [
        {
          assetId: 'retable-rti',
          sceneFrameId: 'study-plane',
          transformInFrame: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          visible: true,
        },
      ],
    },
  ],
};
```

The important point is semantic:

- the HDT remains globally expressed in meters
- the scene operates in millimeters
- the mathematical composition may include a factor of `1000`
- that factor should be interpreted as unit conversion between coordinate systems, not as arbitrary scaling of the retable itself

## Example: Retable Reconstruction With Two Compartments and Two Scenes

To make the model concrete, consider an HDT with two 2D assets.
Each asset represents one compartment of a retable.
Each asset has its own intrinsic image origin and its own asset-local coordinates.
The goal is to place them next to each other in order to reconstruct their original position in the retable.

In this case, the spatial model should separate:

- the HDT-wide origin
- the retable reconstruction frame
- the original location of each compartment in the retable
- the placement of each digital asset into its corresponding compartment frame

Two scenes will reuse the same HDT frame system:

- `retable-reconstruction-scene`: a scene that shows both compartments together
- `left-compartment-study-scene`: a scene dedicated to the left compartment, but still registered in the same HDT spatial basis

This is the key benefit of HDT frames: the semantic structure of the retable is defined once and reused across multiple scenes.
The key rule remains that the assets themselves are still placed by scenes, not by the HDT.

### Conceptual Structure

The HDT-level structure:

- `hdt-origin`: global basis shared by all scenes of the HDT
- `retable-frame`: semantic frame for the reconstructed retable
- `left-compartment-frame`: original location of the left compartment
- `right-compartment-frame`: original location of the right compartment

The scene-level structure:

- one reconstruction scene with its own planar local frames attached to the shared HDT frames
- one left-compartment study scene with its own planar local frames attached to the same shared HDT structure

The scene content:

- the reconstruction scene places the two assets into local planar frames derived from the shared compartment frames
- the study scene reuses the same left compartment through its own local planar frame hierarchy

### Example Model

```ts
const hdtDocumentSpatialDescription = {
  spatialModel: {
    rootHdtFrameId: 'hdt-origin',
    unit: 'mm',
    frames: [
      {
        id: 'hdt-origin',
        label: 'HDT Origin',
        transformToParent: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
      {
        id: 'retable-frame',
        label: 'Retable Reconstruction',
        parentFrameId: 'hdt-origin',
        transformToParent: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
      {
        id: 'left-compartment-frame',
        label: 'Left Compartment',
        parentFrameId: 'retable-frame',
        transformToParent: {
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
      {
        id: 'right-compartment-frame',
        label: 'Right Compartment',
        parentFrameId: 'retable-frame',
        transformToParent: {
          translation: [1200, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: 1,
        },
      },
    ],
  },
  scenes: [
    {
      id: 'retable-reconstruction-scene',
      label: 'Retable Reconstruction',
      coordinateProfile: 'planar2d',
      rootSceneFrameId: 'scene-root',
      frames: [
        {
          id: 'scene-root',
          label: 'Scene Root',
          parentHdtFrameId: 'retable-frame',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'left-panel-plane',
          label: 'Left Panel Plane',
          parentHdtFrameId: 'left-compartment-frame',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'right-panel-plane',
          label: 'Right Panel Plane',
          parentHdtFrameId: 'right-compartment-frame',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'comparison-guide-frame',
          label: 'Comparison Guide',
          parentFrameId: 'scene-root',
          transformToParent: {
            translation: [0, -200, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
      ],
      assetPlacements: [
        {
          assetId: 'asset-left-rti',
          sceneFrameId: 'left-panel-plane',
          transformInFrame: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          visible: true,
        },
        {
          assetId: 'asset-right-rti',
          sceneFrameId: 'right-panel-plane',
          transformInFrame: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          visible: true,
        },
      ],
    },
    {
      id: 'left-compartment-study-scene',
      label: 'Left Compartment Study',
      coordinateProfile: 'planar2d',
      rootSceneFrameId: 'scene-root',
      frames: [
        {
          id: 'scene-root',
          label: 'Scene Root',
          parentHdtFrameId: 'left-compartment-frame',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'left-study-plane',
          label: 'Left Study Plane',
          parentFrameId: 'scene-root',
          transformToParent: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
        {
          id: 'detail-overlay-frame',
          label: 'Detail Overlay',
          parentFrameId: 'left-study-plane',
          transformToParent: {
            translation: [50, 40, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          constraint: 'planar2d',
        },
      ],
      assetPlacements: [
        {
          assetId: 'asset-left-rti',
          sceneFrameId: 'left-study-plane',
          transformInFrame: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: 1,
          },
          visible: true,
        },
      ],
    },
  ],
};
```

### Practical Interpretation

The meaning of this example is:

- the HDT defines a shared reconstruction space
- the retable has a semantic frame of its own
- each compartment has a frame representing its original place in the reconstructed retable
- the reconstruction scene derives local planar working frames from the shared compartment frames
- the study scene reuses the same left-compartment HDT frame through its own local planar working frame
- each scene may still define additional local helper frames for overlays, guides, or temporary composition

This separation is useful because it lets OCRA distinguish:

- the semantics of the reconstruction
- the digital asset identity
- the registration transform of each asset
- the shared HDT spatial structure reused across scenes
- the scene-specific local structure used only by one scene

It also keeps scene behavior coherent:

- the HDT provides the shared global reference system
- the scene defines the actual working frames for composition and interaction
- the asset placement is always interpreted according to the owning scene

If one asset later needs a better crop alignment, scale correction, or planar registration update, only its placement changes.
If a new scene is added later, the existing HDT frames can be reused instead of redefining the retable structure from scratch.
The retable structure itself does not need to be redefined scene by scene.

One detail is worth making explicit.
In the reconstruction scene, `scene-root` is the scene anchor into the HDT graph, but it is not the common parent of every scene-local frame.
Frames such as `left-panel-plane` and `right-panel-plane` attach directly to the shared HDT compartment frames because the goal is to preserve that semantic correspondence explicitly.
So in this model, the scene root is the main attachment frame of the scene, not necessarily the unique ancestor of all scene-local frames.

### Annotation Implications

In the same example:

- an annotation internal to the left compartment may be anchored to `{ scope: 'scene', sceneId: 'left-compartment-study-scene' }`
- an annotation internal to the right compartment may be anchored to the scene where that compartment is being studied
- an annotation about the retable composition as a whole may be anchored to the reconstruction scene
- a scene-specific helper geometry, if needed, is still expressed in the scene root coordinate system

If a geometry is defined directly in the intrinsic coordinate system of a digital asset rather than in a scene frame, it should use `{ scope: 'asset', assetId: <assetId> }`.

This is one of the main advantages of introducing explicit HDT frames:
scenes can derive meaningful working frames from the shared HDT structure, and annotations can then anchor to scene reference spaces or to asset-local reference spaces instead of only to viewer-local coordinates.

## Implementation in the OCRA Ecosystem

This section proposes how the reference-frame model should be implemented across OCRA storage, backend APIs, and derived viewer payloads.

### Current OCRA Persistence Baseline

Today, OCRA already has a clear split of responsibilities:

- PostgreSQL stores projects, users, memberships, and other relational application data
- MongoDB stores the HDT content document and the annotation collections
- project file storage stores uploaded 3D and RTI assets
- viewer scene descriptions are generated by the backend as derived payloads

In the current backend implementation:

- the HDT document is stored in MongoDB in `hdt_collection`
- scenes are embedded inside that HDT document
- scene asset placement is currently stored as flat `position`, `rotation`, and `scale`
- annotation geometry, annotation data, and annotation links are already stored as separate MongoDB resources

This is a good starting point.
The main missing piece is not a new database technology, but a better canonical spatial structure inside the HDT content model.

### Recommended Persistence Strategy

The preferred implementation is:

- keep the canonical spatial model inside the existing HDT MongoDB document
- do not introduce a new PostgreSQL table family for frames or placements
- do not make viewer-specific `scene.json` payloads canonical
- keep annotation resources in their existing collections

In practice, the HDT document should evolve from:

- digital asset pool
- flat scene definitions

to:

- digital asset pool
- HDT spatial model
- scene descriptions that contain scene-local frame graphs and asset placements

This means no separate database is required for the first implementation.
The existing content database is already the natural ownership boundary for:

- HDT frames
- scene frames
- scene asset placements
- scene-level spatial metadata such as unit and coordinate profile

### Suggested MongoDB Shape

Conceptually, the HDT MongoDB document should contain a dedicated spatial section.
One coherent shape would be:

```ts
type HdtDocumentV2 = {
  projectId: string;
  physicalObjectMetadata: PhysicalObjectMetadata;
  digitalAssets: DigitalAsset[];
  spatialModel: HdtSpatialModel;
  scenes: SceneDescriptionV2[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
};
```

With this structure:

- HDT frames are stored once, at HDT scope
- each scene keeps only its own local frame graph and asset placements
- asset placement remains scene-owned
- the backend can validate the full spatial graph in one aggregate document

This is preferable to a separate `scene_frames` or `hdt_frames` collection in the first deliverable because:

- the HDT document is already the aggregate root for scene structure
- most operations need cross-validation between assets, scenes, and frames
- keeping the graph embedded avoids transactional fragmentation across multiple Mongo documents
- OCRA is still under active development, so a coherent aggregate is better than premature normalization

### Should OCRA Introduce Separate DB Structures?

For the first implementation, the answer should be: no new database family, but yes to new logical structures inside MongoDB.

Recommended:

- add `spatialModel` as a first-class object inside the HDT document
- replace flat scene asset transform fields with canonical `assetPlacements`
- replace ad hoc scene-local transform assumptions with explicit `frames`

Not recommended for now:

- a separate PostgreSQL schema for frames
- a separate MongoDB collection for HDT frames
- a separate MongoDB collection for scene frames
- a separate canonical storage of viewer-exported scene JSON

Separate collections may become useful only later if OCRA needs one or more of the following:

- partial document loading for very large HDTs
- independent versioning of spatial subgraphs
- high-frequency collaborative scene-structure editing
- frame-level history or provenance records

Until those needs become concrete, embedded storage is simpler and more consistent.

### Relationship With Annotation Storage

The annotation persistence model does not need a parallel redesign.

In the near term:

- `annotationGeometry` can continue to store `referenceType` and `referenceId`
- scene-scoped geometry still resolves to a scene
- asset-scoped geometry still resolves to an asset

This keeps the annotation collections separate, while allowing them to reuse the same scene-versus-asset distinction already defined in `doc/a00-annotation-model.md`.
The field name `referenceId` is kept here to stay aligned with the current annotation payload shape.
In semantic terms, it corresponds to `sceneId` for scene-scoped geometry and to `assetId` for asset-scoped geometry.

### Derived Viewer Payloads

The spatial model stored in MongoDB should be canonical.
Viewer payloads should remain derived artifacts produced by adapters.

That means:

- `three-presenter` should receive a derived scene description generated from the canonical spatial model
- OpenLIME should receive a derived 2D scene/view description generated from the same canonical spatial model
- viewer payloads must not become the source of truth for frame semantics

This is important because:

- the canonical model needs concepts that current viewers do not expose directly
- different viewers flatten the scene graph in different ways
- viewer payloads are implementation-specific projections, not the shared project model

### Recommended Backend API Evolution

The current backend already exposes scene and scene-asset endpoints under `/api/projects/{projectId}/hdt/...`.
The new spatial model should extend that family rather than introduce a disconnected API namespace.

The cleanest direction is to add explicit spatial subresources.

Recommended read endpoints:

- `GET /api/projects/{projectId}/hdt/spatial-model`
- `GET /api/projects/{projectId}/hdt/frames`
- `GET /api/projects/{projectId}/hdt/frames/{frameId}`
- `GET /api/projects/{projectId}/hdt/scenes/{sceneId}/frames`
- `GET /api/projects/{projectId}/hdt/scenes/{sceneId}/frames/{frameId}`
- `GET /api/projects/{projectId}/hdt/scenes/{sceneId}/asset-placements`
- `GET /api/projects/{projectId}/hdt/scenes/{sceneId}/asset-placements/{assetId}`

Recommended write endpoints:

- `PUT /api/projects/{projectId}/hdt/spatial-model`
- `POST /api/projects/{projectId}/hdt/frames`
- `PUT /api/projects/{projectId}/hdt/frames/{frameId}`
- `DELETE /api/projects/{projectId}/hdt/frames/{frameId}`
- `POST /api/projects/{projectId}/hdt/scenes/{sceneId}/frames`
- `PUT /api/projects/{projectId}/hdt/scenes/{sceneId}/frames/{frameId}`
- `DELETE /api/projects/{projectId}/hdt/scenes/{sceneId}/frames/{frameId}`
- `POST /api/projects/{projectId}/hdt/scenes/{sceneId}/asset-placements`
- `PUT /api/projects/{projectId}/hdt/scenes/{sceneId}/asset-placements/{assetId}`
- `DELETE /api/projects/{projectId}/hdt/scenes/{sceneId}/asset-placements/{assetId}`

In this full granular API, `GET/PUT /api/projects/{projectId}/hdt/spatial-model` should operate only on `HdtSpatialModel`, meaning the HDT frame graph and its unit.
Scene-local frames and asset placements are managed through the dedicated scene endpoints listed above.

These endpoint shapes intentionally assume at most one placement per `assetId` within a given scene.
If OCRA later needs repeated placements of the same asset in one scene, these endpoints should move to `.../asset-placements/{placementId}` and the data model should introduce a dedicated placement identifier.

### Why Add Dedicated Spatial Endpoints

Dedicated spatial endpoints are preferable to updating whole scenes blindly because they:

- reduce accidental overwrites during concurrent editing
- let the backend validate operations at the right structural level
- make audit events more meaningful
- avoid mixing environment settings, labels, and spatial graph mutations in one opaque payload

For example:

- renaming a scene is not the same class of operation as rewiring a frame parent
- changing a background color is not the same class of operation as moving an asset registration
- deleting an HDT frame must trigger referential validation across all attached scenes

### Minimal API Option

If OCRA wants a smaller first step, a reduced API is still acceptable.

Minimum viable addition:

- `GET /api/projects/{projectId}/hdt/spatial-model`
- `PUT /api/projects/{projectId}/hdt/spatial-model`

Under that approach:

- the frontend edits the whole spatial model as one aggregate
- the backend performs full validation before persistence
- existing scene create/update endpoints can remain temporarily available

In this minimal option, `GET/PUT /api/projects/{projectId}/hdt/spatial-model` should operate on the full `HdtDocumentSpatialDescription`, meaning both the HDT-level frame graph and the scene-level structures together.

This is simpler to implement, but it should be treated as an intermediate step.
As soon as frame editing becomes interactive, more granular spatial endpoints will be preferable.

### Validation Responsibilities

Validation should happen in both shared runtime schemas and backend service logic.

Shared schema validation should cover:

- required field shape
- finite numeric values
- quaternion length constraints
- positive uniform scale
- legal `planar2d` transform subsets

Backend aggregate validation should cover:

- parent existence
- root existence
- acyclic frame graphs
- scene-to-HDT attachment validity
- asset placement references to existing scene frames
- uniqueness of `assetPlacements[].assetId` within each scene
- prevention of deleting frames that are still referenced
- annotation consistency checks when scene-scoped frame anchoring is introduced

### Migration Strategy

The migration should be structural, not additive.

Recommended path:

1. define canonical shared schemas for `SimilarityTransform3`, `HdtFrame`, `SceneFrame`, `SceneAssetPlacement`, `SceneDescriptionV2`, and `HdtSpatialModel`
2. evolve the MongoDB HDT document shape to include the canonical spatial model
3. migrate existing flat scene asset transforms into canonical `assetPlacements`
4. update backend services so viewer payloads are generated from the canonical spatial model only
5. update scene editing APIs to read and write the canonical model
6. evolve annotation geometry references only when frame-level scene anchoring is actually needed

During migration, the old flat `position` / `rotation` / `scale` representation may still be emitted as a derived compatibility projection for current viewers, but it should no longer be treated as canonical stored structure.

### Recommended First Deliverable

A realistic first deliverable for OCRA would be:

- add `spatialModel` to the HDT MongoDB document
- upgrade `scenes[]` to the new frame-based structure
- keep scene storage embedded in the HDT document
- expose `GET` and `PUT` for `/hdt/spatial-model`
- keep viewer scene export fully derived
- postpone frame-aware annotation payload changes until the spatial model is stable

This gives OCRA a clean canonical reference system without forcing an unnecessary database split too early.

## Summary

The proposed direction is to make reference frames first-class in OCRA.

The canonical scene model should:

- represent a graph of named HDT-level frames
- represent a graph of named scene-local frames
- place assets into those frames using 3D similarity transforms
- support both `free3d` and `planar2d` through explicit constraints
- reuse the same frame identity system for annotation geometry
- keep viewer-specific coordinate systems as adapter concerns

This provides a cleaner foundation for future scene editing, scene validation, 2D/3D interoperability, and annotation anchoring.
