/**
 * Shared type definitions for scene description and presenter state
 * Used by both frontend and backend for scene rendering and presenter state.
 *
 * Note: annotation types in this file are viewer-only rendering models.
 * They are not the canonical annotation domain model, which lives in
 * annotation-schema.ts / annotation-types.ts.
 */

/**
 * Viewer annotation shape type used only for scene rendering.
 */
export type ViewerAnnotationShapeType = 'point' | 'line' | 'area';

/**
 * Viewer annotation geometry used only for scene rendering.
 *
 * Geometry for different rendered annotation shapes:
 * - Point: single 3D coordinate [x, y, z]
 * - Line: array of 3D coordinates [[x1,y1,z1], [x2,y2,z2], ...]
 * - Area: array of 3D coordinates forming a closed polygon
 */
export type ViewerAnnotationGeometry = 
  | [number, number, number]           // Point
  | [number, number, number][]         // Line or Area (array of points)

/**
 * A single viewer annotation in the scene.
 *
 * This is a rendering-oriented DTO for 2D/3D viewers, not the canonical
 * persisted annotation structure.
 */
export interface ViewerAnnotation {
  /** Unique identifier for the annotation */
  id: string;
  /** User-visible label/name for the annotation */
  label: string;
  /** Optional semantic class reference used by viewers for class-driven styling. */
  semanticClass?: string | null;
  /**
   * Optional structural class for presentation overlays (e.g. `ghost`, `underEditing`).
   * Applied on top of semantic styling by OpenLIME.
   */
  structuralClass?: string | null;
  /** Optional dashed stroke pattern for viewer-side semantic overlays. */
  strokeDasharray?: string | null;
  /** Type of annotation */
  type: ViewerAnnotationShapeType;
  /** Geometric data for the annotation */
  geometry: ViewerAnnotationGeometry;
  /** Optional creation timestamp */
  createdAt?: string;
  /** Optional user who created it */
  createdBy?: string;
  /** Optional description for the annotation */
  description?: string;
}

/**
 * Describes a single 3D model in the scene
 */
export interface ModelDefinition {
  /** Unique identifier for the model */
  id: string;
  /** Filename of the model (e.g., "model.glb", "mesh.ply") */
  file: string;
  /** Human-friendly title for the model (defaults to filename base) */
  title?: string;
  /** Position in 3D space [x, y, z], defaults to [0, 0, 0] */
  position?: [number, number, number];
  /** Rotation in radians [x, y, z], defaults to [0, 0, 0] */
  rotation?: [number, number, number];
  /** Optional explicit rotation units for this model. If provided, overrides scene-level setting. */
  rotationUnits?: 'deg' | 'rad';
  /** Scale factors [x, y, z], defaults to [1, 1, 1] */
  scale?: number | [number, number, number];
  /** Whether the model is visible, defaults to true */
  visible?: boolean;
  /** Optional material property overrides */
  material?: {
    color?: string;
    metalness?: number;
    roughness?: number;
    flatShading?: boolean;
  };
}

/**
 * Describes environment settings for the scene
 */
export interface EnvironmentSettings {
  /** Whether to show the ground grid */
  showGround?: boolean;
  /** Background color as hex string (e.g., "#404040") */
  background?: string;
  /**
   * Optional head light offset expressed in degrees [horizontal, vertical]
   * Horizontal: degrees to rotate around Y (positive -> rotate right)
   * Vertical: degrees to rotate from camera polar angle (positive -> rotate up)
   */
  headLightOffset?: [number, number];
}

/**
 * Complete scene description - what models exist and their properties
 * Stored as scene.json alongside the model files.
 * Any annotations here are viewer annotations used for rendering.
 */
export interface SceneDescription {
  /** Project ID for resolving file URLs */
  projectId?: string;
  /** List of 3D models in the scene */
  models: ModelDefinition[];
  /** Environment and rendering settings */
  environment?: EnvironmentSettings;
  /** Whether trackball/orbit controls are enabled */
  enableControls?: boolean;
  /** Optional scene-level default for rotation units (overridden by model.rotationUnits) */
  rotationUnits?: 'deg' | 'rad';
  /** Array of annotations in the scene */
  annotations?: ViewerAnnotation[];
}

/**
 * Camera state for saving/restoring view
 */
export interface CameraState {
  /** Camera position [x, y, z] */
  position: [number, number, number];
  /** Camera look-at target [x, y, z] */
  target: [number, number, number];
  /** Field of view in degrees */
  fov?: number;
}

/**
 * Rendering settings state
 */
export interface RenderingState {
  /** Whether the head light is enabled */
  headLightEnabled: boolean;
  /** Whether environment lighting (HDR) is enabled */
  envLightingEnabled: boolean;
}

/**
 * Complete presenter state - how the user is currently viewing the scene
 * Can be saved per-user in database or localStorage
 */
export interface PresenterState {
  /** Current camera position and orientation */
  camera: CameraState;
  /** Current rendering settings */
  rendering: RenderingState;
  /** Visibility state for each model by ID */
  modelVisibility: Record<string, boolean>;
}
