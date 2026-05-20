# Scene JSON Format Documentation

## Overview

The `scene.json` file describes the 3D scene configuration for a project, including which models to load, their transformations, and rendering settings. This file is stored in each project's folder alongside the 3D model files.

**Location**: `/project_files/{projectId}/scene.json`

## Complete Schema

```typescript
{
  "projectId": "optional-project-id",          // String (optional, set automatically)
  "models": [...],                             // Array of ModelDefinition (required)
  "environment": {...},                        // EnvironmentSettings (optional)
  "enableControls": true,                      // Boolean (optional, default: true)
  "rotationUnits": "deg"                       // "deg" | "rad" (optional, default: "rad")
}
```

## Top-Level Properties

### `projectId` (optional)
- **Type**: `string`
- **Default**: Set automatically by the system
- **Description**: The unique identifier for the project. Usually added by the backend when serving the scene.
- **Example**: `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`

### `models` (required)
- **Type**: `Array<ModelDefinition>`
- **Description**: List of 3D models to load and display in the scene.
- **Minimum**: At least one model is typically expected, but an empty array is valid for an empty scene.
- **See**: [Model Definition](#model-definition) below

### `environment` (optional)
- **Type**: `EnvironmentSettings` object
- **Description**: Scene environment and rendering configuration
- **See**: [Environment Settings](#environment-settings) below

### `enableControls` (optional)
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Whether to enable orbit/trackball camera controls
- **Usage**: Set to `false` to disable user interaction with the camera

### `rotationUnits` (optional)
- **Type**: `"deg"` | `"rad"`
- **Default**: `"rad"`
- **Description**: Default rotation units for all models in the scene
- **Note**: Individual models can override this with their own `rotationUnits` property

---

## Model Definition

Each entry in the `models` array describes a single 3D model:

```typescript
{
  "id": "unique-model-id",                     // String (required)
  "file": "model.glb",                         // String (required)
  "title": "Display Name",                     // String (optional)
  "position": [0, 0, 0],                       // [x, y, z] (optional)
  "rotation": [180, 0, 0],                     // [x, y, z] (optional)
  "rotationUnits": "deg",                      // "deg" | "rad" (optional)
  "scale": 1.5,                                // Number | [x, y, z] (optional)
  "visible": true,                             // Boolean (optional)
  "material": {                                // Object (optional)
    "color": "#ff0000",
    "metalness": 0.5,
    "roughness": 0.5,
    "flatShading": false
  }
}
```

### Properties

#### `id` (required)
- **Type**: `string`
- **Description**: Unique identifier for this model instance
- **Usage**: Used for visibility toggling, selection, and state management
- **Constraints**: Must be unique within the scene
- **Example**: `"lion_statue_01"`, `"column_base"`

#### `file` (required)
- **Type**: `string`
- **Description**: Filename of the 3D model file
- **Supported Formats**: `.glb`, `.gltf`, `.ply`, `.obj`, `.stl`, `.fbx`, `.dae`, `.3ds`, `.x3d`, `.nxs`
- **Path**: Relative to the project folder
- **Example**: `"lion_crushing_a_serpent.glb"`

#### `title` (optional)
- **Type**: `string`
- **Description**: Human-readable name displayed in the UI
- **Default**: Filename without extension
- **Example**: `"Lion Crushing a Serpent"`

#### `position` (optional)
- **Type**: `[number, number, number]` (3D vector)
- **Default**: `[0, 0, 0]`
- **Description**: Position in 3D space (x, y, z coordinates)
- **Units**: World units (after normalization, typically ~1 unit = model size)
- **Example**: `[0, 0.5, 0]` (raised 0.5 units on Y axis)

#### `rotation` (optional)
- **Type**: `[number, number, number]` (3D vector)
- **Default**: `[0, 0, 0]`
- **Description**: Rotation around X, Y, Z axes (Euler angles)
- **Units**: Depends on `rotationUnits` (degrees or radians)
- **Order**: Applied in XYZ order
- **Common Values**:
  - `[180, 0, 0]` (degrees) - Flip upside down
  - `[0, 90, 0]` (degrees) - Rotate 90° around Y axis
  - `[Math.PI, 0, 0]` (radians) - Flip upside down

#### `rotationUnits` (optional)
- **Type**: `"deg"` | `"rad"`
- **Default**: Inherits from scene-level `rotationUnits` (default: `"rad"`)
- **Description**: Units for this model's rotation values
- **Example**: `"deg"` for degrees, `"rad"` for radians

#### `scale` (optional)
- **Type**: `number` | `[number, number, number]`
- **Default**: `1` (no scaling)
- **Description**: Scale factor(s) for the model
- **Uniform Scale**: Single number applies to all axes (e.g., `2` = double size)
- **Non-uniform Scale**: Array for independent axis scaling (e.g., `[1, 2, 1]` = stretch on Y)
- **Examples**:
  - `1.5` - 150% size
  - `[2, 1, 2]` - Double width and depth, normal height

#### `visible` (optional)
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Whether the model is initially visible
- **Usage**: Can be toggled via UI or API
- **Example**: `false` to hide model on load

#### `material` (optional)
- **Type**: `MaterialOverride` object
- **Description**: Override default material properties
- **Properties**:
  - `color` (string): Hex color code (e.g., `"#ff0000"`)
  - `metalness` (number): 0-1, how metallic the surface is
  - `roughness` (number): 0-1, surface roughness (0=mirror, 1=diffuse)
  - `flatShading` (boolean): Use flat shading instead of smooth

---

## Environment Settings

Configures the scene environment and background:

```typescript
{
  "showGround": true,                          // Boolean (optional)
  "background": "#404040"                      // String (optional)
}
```

### Properties

#### `showGround` (optional)
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Whether to display a ground grid plane
- **Visual**: Shows a grid at Y=0 for spatial reference
- **Size**: 2 units wide, 20×20 divisions

#### `background` (optional)
- **Type**: `string` (hex color)
- **Default**: `"#000000"` (black)
- **Description**: Scene background color
- **Format**: CSS hex color (e.g., `"#404040"`, `"#ffffff"`)
- **Examples**:
  - `"#404040"` - Dark gray
  - `"#ffffff"` - White
  - `"#87ceeb"` - Sky blue

---

## Complete Examples

### Example 1: Simple Single Model

```json
{
  "models": [
    {
      "id": "statue_01",
      "file": "marble_statue.glb",
      "title": "Roman Marble Statue",
      "visible": true
    }
  ],
  "environment": {
    "showGround": true,
    "background": "#404040"
  },
  "enableControls": true
}
```

### Example 2: Multiple Models with Transformations

```json
{
  "models": [
    {
      "id": "lion_crushing_a_serpent",
      "title": "Lion Crushing a Serpent",
      "file": "lion_crushing_a_serpent_t1k.glb",
      "rotation": [180, 0, 0],
      "rotationUnits": "deg",
      "visible": true
    },
    {
      "id": "pedestal",
      "title": "Stone Pedestal",
      "file": "pedestal.glb",
      "position": [0, -0.5, 0],
      "scale": 1.2,
      "visible": true
    }
  ],
  "environment": {
    "showGround": true,
    "background": "#2c3e50"
  },
  "enableControls": true,
  "rotationUnits": "deg"
}
```

### Example 3: Model with Custom Material

```json
{
  "models": [
    {
      "id": "bronze_bust",
      "file": "bust_scan.ply",
      "title": "Bronze Bust Reconstruction",
      "rotation": [0, 45, 0],
      "rotationUnits": "deg",
      "material": {
        "color": "#cd7f32",
        "metalness": 0.8,
        "roughness": 0.3
      },
      "visible": true
    }
  ],
  "environment": {
    "showGround": false,
    "background": "#1a1a1a"
  }
}
```

### Example 4: Multiple Instances with Non-uniform Scaling

```json
{
  "models": [
    {
      "id": "column_left",
      "file": "column.obj",
      "position": [-2, 0, 0],
      "scale": [1, 1.5, 1],
      "visible": true
    },
    {
      "id": "column_right",
      "file": "column.obj",
      "position": [2, 0, 0],
      "scale": [1, 1.5, 1],
      "visible": true
    },
    {
      "id": "arch",
      "file": "arch.glb",
      "position": [0, 1.5, 0],
      "visible": true
    }
  ],
  "environment": {
    "showGround": true,
    "background": "#87ceeb"
  }
}
```

---

## Technical Notes

### Model Loading and Normalization

1. **Automatic Centering**: Models are automatically centered at the origin
2. **Automatic Scaling**: Models are normalized to approximately 1 unit in size
3. **Transformation Order**: Transformations are applied in order: Scale → Rotation → Position
4. **Coordinate System**: Right-handed coordinate system (Y-up)

### File Format Support

The ThreePresenter supports multiple 3D formats:
- **GLB/GLTF**: Recommended format, supports PBR materials, animations
- **PLY**: Point cloud and mesh format, good for scanned data
- **OBJ**: Legacy format, widely supported
- **STL**: Simple mesh format, no material support
- **FBX, DAE, 3DS**: Additional formats via Three.js loaders
- **NXS**: Nexus format for large models (experimental)

### Performance Considerations

- **Model Size**: Keep individual files under 50MB for best performance
- **Polygon Count**: Aim for under 1M triangles per model for smooth interaction
- **Texture Size**: Use compressed textures (2K recommended, 4K maximum)
- **Number of Models**: Performance degrades with >10 models in a single scene

### Rotation Units

The system supports both degrees and radians for rotation values:
- **Degrees** (`"deg"`): More intuitive for manual editing (0-360)
- **Radians** (`"rad"`): Native Three.js format (0 to 2π)

Set `rotationUnits` at the scene level for all models, or override per-model.

---

## Validation

### Required Fields
- At least the `models` array must be present
- Each model must have `id` and `file` properties

### Common Errors
1. **Duplicate IDs**: Each model's `id` must be unique
2. **Missing Files**: Referenced files must exist in the project folder
3. **Invalid Colors**: Background colors must be valid hex format
4. **Invalid Rotation Units**: Must be exactly `"deg"` or `"rad"`

### Schema Validation

TypeScript types are defined in `/shared/scene-types.ts` and provide compile-time validation.

---

## API Endpoints

### Get Scene
```
GET /api/projects/{projectId}/scene
```
Returns the scene.json for the specified project.

### Update Scene
```
PUT /api/projects/{projectId}/scene
Content-Type: application/json

{scene.json content}
```
Updates the scene.json file (requires manager role).

---

## Related Files

- **Type Definitions**: `/shared/scene-types.ts`
- **ThreePresenter**: `/frontend/src/components/ThreePresenter.ts`
- **Seed Examples**: `/backend/seed.ts`
- **API Routes**: `/backend/src/routes/projects.routes.ts`

---

## Changelog

### Version 1.0 (Current)
- Initial scene.json format
- Support for multiple models with transformations
- Environment settings (ground, background)
- Material overrides
- Rotation units support (degrees/radians)

### Planned Features
- Camera presets and animations
- Lighting configurations
- Annotation markers
- Model groups and hierarchies
