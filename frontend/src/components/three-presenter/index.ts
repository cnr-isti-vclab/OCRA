/**
 * Three Presenter - Modular 3D Viewer Components
 * 
 * Independent, reusable modules for building 3D viewers with Three.js
 */

// Export annotation system
export { AnnotationManager } from './AnnotationManager';
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

export { OcraFileUrlResolver } from './OcraFileUrlResolver';

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
export { UIControlsBuilder, createButton, createButtonPanel } from './UIControlsBuilder';
export type {
  ButtonConfig,
  ContainerConfig,
  UIControlsResult
} from './UIControlsBuilder';

// Export camera manager
export { CameraManager, createCameraManager, calculateFrustumSize } from './CameraManager';
export type {
  CameraConfig,
  CameraState,
  CameraInfo
} from './CameraManager';
