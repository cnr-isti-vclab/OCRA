/**
 * Shared type definitions for scene description and presenter state
 * Used by both frontend and backend
 */

/**
 * Annotation type - can be point, line, or area
 */
export type AnnotationType = 'point' | 'line' | 'area';

/**
 * Geometry for different annotation types
 * - Point: single 3D coordinate [x, y, z]
 * - Line: array of 3D coordinates [[x1,y1,z1], [x2,y2,z2], ...]
 * - Area: array of 3D coordinates forming a closed polygon
 */
export type AnnotationGeometry = 
  | [number, number, number]           // Point
  | [number, number, number][]         // Line or Area (array of points)

/**
 * A single annotation in the scene
 */
export interface Annotation {
  /** Unique identifier for the annotation */
  id: string;
  /** User-visible label/name for the annotation */
  label: string;
  /** Type of annotation */
  type: AnnotationType;
  /** Geometric data for the annotation */
  geometry: AnnotationGeometry;
  /** Optional creation timestamp */
  createdAt?: string;
  /** Optional user who created it */
  createdBy?: string;
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
 * Stored as scene.json alongside the model files
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
  annotations?: Annotation[];
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
