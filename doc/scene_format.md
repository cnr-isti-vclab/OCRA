# Scene JSON Format

This document describes the JSON format used by the OCRA frontend presenter to describe which models belong to a scene and their per-model settings (transforms, visibility, simple material overrides, etc.). The presenter expects a clean, explicit format — legacy formats (meshes/modelInstances) are not supported.

## Top-level `SceneDescription`

A scene description is a JSON object with the following fields:

- `projectId` (optional string)
  - The project identifier used by the presenter to build relative file URLs when a model `file` is a plain filename. When the presenter receives a `scene` from the backend, the frontend code will attach `projectId` if it's not present.

- `models` (required array of `ModelDefinition`)
  - The list of 3D models included in the scene.

- `environment` (optional `EnvironmentSettings`)
  - A small set of environment and background settings.

- `enableControls` (optional boolean)
  - Whether orbit/trackball controls should be enabled. Defaults to `true`.

- `rotationUnits` (optional, `'deg' | 'rad'`)
  - Scene-level default for rotation units. A model-level `rotationUnits` (see below) overrides this.

Example top-level structure:

```json
{
  "projectId": "my-project-123",
  "models": [ /* array of models */ ],
  "environment": { "showGround": true, "background": "#404040" },
  "enableControls": true,
  "rotationUnits": "deg"
}
```

## `ModelDefinition`

Each item in `models` is an object describing a single model file and optional per-model overrides:

- `id` (string, required)
  - Unique identifier for the model inside the scene. Used for visibility toggles and state storage.

- `file` (string, required)
  - The filename or URL of the model file (e.g. `lion.glb`, `mesh.ply`, or an absolute `http://...` URL).
  - If `file` is a plain filename and `projectId` is available in the scene, the presenter will construct the URL to download the file as:
    `/api/projects/{projectId}/files/{encodeURIComponent(file)}`

- `position` (optional array [x, y, z])
  - Local translation applied after loading the model. Units are scene units (meters). Example: `[0, 0.1, 0]`.

- `rotation` (optional array [x, y, z])
  - Euler rotation applied to the model. The units used are determined as follows (in order):
    1. If `rotationUnits` is provided on the model (`rotationUnits: "deg" | "rad"`) the presenter uses it.
    2. Otherwise if the top-level scene `rotationUnits` is present it is used.
    3. Otherwise the presenter auto-detects: if any component's absolute value is greater than `2π` the values are interpreted as degrees and converted to radians; otherwise they are treated as radians.
  - Example: `[0, 90, 0]` (degrees) or `[0, 1.5708, 0]` (radians).

- `rotationUnits` (optional, `'deg' | 'rad'`)
  - Per-model explicit units for the `rotation` array.

- `scale` (optional number or array [x, y, z])
  - Uniform or non-uniform scaling applied to the model. If a single number is provided it is applied to all axes. Example: `0.75` or `[0.75, 0.75, 0.75]`.

- `visible` (optional boolean)
  - Whether the model should be visible by default. Defaults to `true`.

- `material` (optional object)
  - A small set of material properties that the presenter will use to create a `MeshStandardMaterial` for simple cases. Supported fields:
    - `color`: hex string (e.g. `"#dddddd"`) or numeric color value
    - `metalness`: number 0..1
    - `roughness`: number 0..1
    - `flatShading`: boolean

Example `ModelDefinition`:

```json
{
  "id": "statue",
  "file": "statue.glb",
  "position": [0, 0.1, 0],
  "rotation": [0, 90, 0],
  "rotationUnits": "deg",
  "scale": 0.75,
  "visible": true,
  "material": { "color": "#dddddd", "metalness": 0.2, "roughness": 0.6 }
}
```

## `EnvironmentSettings`

- `showGround` (optional boolean) — whether to display a ground grid/plane.
- `background` (optional string) — CSS/hex color string for the scene background, e.g. `"#404040"`.

## Minimal valid scene

```json
{
  "models": [
    { "id": "model1", "file": "model1.glb" }
  ]
}
```

## Notes and behavior

- File download URL behavior:
  - If `file` starts with `http` the presenter will fetch it directly.
  - If `file` is a relative filename the presenter will construct a URL using `projectId`:
    `/api/projects/{projectId}/files/{encodeURIComponent(file)}`
  - Ensure backend exposes project files at that endpoint (the default backend implementation does).

- Rotation units precedence: `model.rotationUnits` → `scene.rotationUnits` → auto-detect (if neither present).

- The presenter applies transforms after the model is loaded. Position, rotation and scale are applied to the root `Object3D` returned by the loader. For GLTF files that contain a `scene` with multiple nodes, transforms are applied to the top-level object the loader returns.

- The `visible` flag controls the initial `visible` property on the loaded `Object3D`. The UI exposes per-model visibility toggles that operate using the `id` field.

- Legacy formats (`meshes` + `modelInstances`) are not supported by the presenter any more. If you have legacy scene JSON files, migrate them to the `models[]` format.

## JSON Schema (informal)

The following is a small JSON Schema sketch you can use as a starting point for validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "projectId": { "type": "string" },
    "rotationUnits": { "type": "string", "enum": ["deg", "rad"] },
    "enableControls": { "type": "boolean" },
    "environment": {
      "type": "object",
      "properties": {
        "showGround": { "type": "boolean" },
        "background": { "type": "string" }
      }
    },
    "models": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "file": { "type": "string" },
          "position": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
          "rotation": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 },
          "rotationUnits": { "type": "string", "enum": ["deg", "rad"] },
          "scale": { "oneOf": [ { "type": "number" }, { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3 } ] },
          "visible": { "type": "boolean" },
          "material": { "type": "object" }
        },
        "required": ["id", "file"]
      }
    }
  },
  "required": ["models"]
}
```

## Examples

Scene with scene-level degree rotations and multiple models:

```json
{
  "projectId": "demo-project",
  "rotationUnits": "deg",
  "models": [
    { "id": "lion", "file": "lion.glb", "position": [0,0,0], "rotation": [0,90,0], "scale": 1.0 },
    { "id": "shield", "file": "shield.ply", "position": [0.5,0,0], "rotation": [0,180,0], "scale": [1,1,1], "visible": true }
  ],
  "environment": { "showGround": true, "background": "#202020" }
}
```

## Troubleshooting

- If a model does not appear:
  - Check browser console for `Loading model` and `✅ Loaded model` messages.
  - Verify the file URL that the presenter tries to load. If using a relative filename, ensure `projectId` is present or that the backend writes the correct URL in `file`.
  - Ensure the backend serves `/api/projects/:projectId/files/:filename`.

- If rotations look wrong, explicitly set `rotationUnits` on the model or scene to `"deg"` or `"rad"`.

---

If you want, I can also add a small validation script (Node.js) that reads a `scene.json` and validates it against the schema above. Would you like that?