/**
 * Three Presenter - Modular 3D Viewer Components
 * 
 * Independent, reusable modules for building 3D viewers with Three.js
 */

// Export main ThreePresenter class
export { ThreePresenter } from './ThreePresenter';
export type { SceneDescription, ModelDefinition, PresenterState, LoadingProgress } from './ThreePresenter';

// Export annotation system
export { AnnotationManager } from './managers/AnnotationManager';
export type {
  Annotation,
  AnnotationType,
  AnnotationGeometry,
  AnnotationConfig,
  SelectionChangeCallback,
  PointPickedCallback
} from './types/AnnotationTypes';

// Export file URL resolvers
export type {
  FileUrlResolver,
  FileResolverContext
} from './types/FileUrlResolver';

export {
  DefaultFileUrlResolver,
  StaticBaseUrlResolver,
  FunctionResolver
} from './types/FileUrlResolver';

// Export geometry utilities
export type { GeometryStats } from './utils/GeometryUtils';

export {
  calculateObjectStats,
  calculateSceneBoundingBox,
  getMaxDimension,
  calculateCameraDistance,
  calculateCenteringOffset,
  calculateSceneCenteringOffset,
  hasValidPosition,
  roundPosition,
  formatStats
} from './utils/GeometryUtils';

// Export UI controls builder
export { UIControlsBuilder, createButton, createButtonPanel } from './ui/UIControlsBuilder';
export type {
  ButtonConfig,
  ContainerConfig,
  UIControlsResult
} from './ui/UIControlsBuilder';

// Export camera manager
export { CameraManager, createCameraManager, calculateFrustumSize } from './managers/CameraManager';
export type {
  CameraConfig,
  CameraState,
  CameraInfo
} from './managers/CameraManager';

// Export lighting manager
export { LightingManager } from './managers/LightingManager';
export type {
  LightingConfig,
  LightingState
} from './managers/LightingManager';

// Export model loader
export { ModelLoader, createModelLoader } from './managers/ModelLoader';
export type {
  LoaderConfig,
  MaterialProperties,
  ProgressCallback,
  LoadResult
} from './managers/ModelLoader';
