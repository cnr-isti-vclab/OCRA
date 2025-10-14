/**
 * Annotation type definitions for ThreePresenter
 * 
 * This module defines the interfaces and types for the annotation system.
 * Annotations are independent from the scene and can be rendered on any 3D model.
 */

/**
 * Type of annotation geometry
 */
export type AnnotationType = 'point' | 'line' | 'area';

/**
 * Geometry data for an annotation
 * - Point: [x, y, z]
 * - Line/Area: Array of [x, y, z] points
 */
export type AnnotationGeometry = 
  | [number, number, number]  // Point
  | [number, number, number][]; // Line or Area

/**
 * Annotation data structure
 */
export interface Annotation {
  id: string;
  label: string;
  type: AnnotationType;
  geometry: AnnotationGeometry;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Configuration options for AnnotationManager
 */
export interface AnnotationConfig {
  /** Color for unselected annotation markers (hex) */
  color?: number;
  /** Color for selected annotation markers (hex) */
  selectedColor?: number;
  /** Opacity for unselected markers (0-1) */
  opacity?: number;
  /** Opacity for selected markers (0-1) */
  selectedOpacity?: number;
  /** Target screen-space size in pixels for markers */
  markerSize?: number;
  /** Sphere geometry segments (lower = better performance) */
  sphereSegments?: number;
}

/**
 * Callback type for annotation selection changes
 */
export type SelectionChangeCallback = (selectedIds: string[]) => void;

/**
 * Callback type for annotation picking (point selection on model)
 */
export type PointPickedCallback = (point: [number, number, number]) => void;
