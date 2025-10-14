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
