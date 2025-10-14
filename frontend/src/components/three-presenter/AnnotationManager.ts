/**
 * AnnotationManager - Independent annotation rendering and selection system
 * 
 * This module manages 3D annotation markers in a Three.js scene.
 * It handles rendering, selection, screen-space sizing, and picking mode.
 * 
 * Features:
 * - Render annotations as 3D spheres
 * - Multi-select support (Ctrl/Cmd + click)
 * - Screen-space consistent sizing (perspective & orthographic)
 * - Picking mode for creating new annotations
 * - Visual feedback for selection state
 * 
 * @example
 * ```typescript
 * const manager = new AnnotationManager(scene, {
 *   color: 0xffff00,
 *   selectedColor: 0xffff66,
 *   markerSize: 10
 * });
 * 
 * manager.render(annotations);
 * manager.select(['id1', 'id2'], false);
 * manager.onSelectionChange((ids) => console.log('Selected:', ids));
 * ```
 */

import * as THREE from 'three';
import type {
  Annotation,
  AnnotationConfig,
  SelectionChangeCallback,
  PointPickedCallback
} from './types/AnnotationTypes';

/**
 * Default configuration for annotation rendering
 */
const DEFAULT_CONFIG: Required<AnnotationConfig> = {
  color: 0xffff00,           // Yellow
  selectedColor: 0xffff66,   // Brighter yellow
  opacity: 0.9,              // Slightly transparent
  selectedOpacity: 1.0,      // Fully opaque
  markerSize: 10,            // 10 pixels
  sphereSegments: 16         // Good balance of quality/performance
};

/**
 * AnnotationManager - Manages annotation markers in a Three.js scene
 */
export class AnnotationManager {
  private scene: THREE.Scene;
  private config: Required<AnnotationConfig>;
  
  // Annotation state
  private markers: Map<string, THREE.Mesh> = new Map();
  private selectedIds: Set<string> = new Set();
  private annotations: Annotation[] = [];
  
  // Callbacks
  private selectionCallbacks: SelectionChangeCallback[] = [];
  private pickCallback: PointPickedCallback | null = null;
  
  /**
   * Create a new AnnotationManager
   * @param scene - The Three.js scene to add markers to
   * @param config - Optional configuration for appearance and behavior
   */
  constructor(scene: THREE.Scene, config: AnnotationConfig = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Render annotations as 3D markers in the scene
   * @param annotations - Array of annotations to render
   */
  render(annotations: Annotation[]): void {
    this.annotations = annotations;
    
    // Remove markers that no longer exist
    const currentIds = new Set(annotations.map(a => a.id));
    for (const [id, marker] of this.markers.entries()) {
      if (!currentIds.has(id)) {
        this.removeMarker(id);
      }
    }

    // Add or update markers
    annotations.forEach(annotation => {
      // Only handle point annotations for now
      if (annotation.type !== 'point') return;
      
      const geometry = annotation.geometry as [number, number, number];
      const position = new THREE.Vector3(geometry[0], geometry[1], geometry[2]);
      
      let marker = this.markers.get(annotation.id);
      const isSelected = this.selectedIds.has(annotation.id);
      
      if (marker) {
        // Update existing marker
        marker.position.copy(position);
        this.updateMarkerAppearance(marker, isSelected);
      } else {
        // Create new marker
        marker = this.createMarker(position, isSelected);
        this.markers.set(annotation.id, marker);
        this.scene.add(marker);
      }
    });

    console.log(`🎯 AnnotationManager: Rendered ${annotations.length} annotation(s)`);
  }

  /**
   * Select one or more annotations
   * @param ids - Array of annotation IDs to select
   * @param additive - If true, add to selection; if false, replace selection
   */
  select(ids: string[], additive: boolean = false): void {
    if (!additive) {
      this.selectedIds.clear();
    }
    
    ids.forEach(id => this.selectedIds.add(id));
    this.updateAllMarkerAppearances();
    this.notifySelectionChange();
    
    console.log(`✅ AnnotationManager: Selected ${ids.length} annotation(s) (total: ${this.selectedIds.size})`);
  }

  /**
   * Toggle selection state of an annotation
   * @param id - Annotation ID to toggle
   */
  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      console.log(`❌ AnnotationManager: Deselected ${id}`);
    } else {
      this.selectedIds.add(id);
      console.log(`✅ AnnotationManager: Selected ${id}`);
    }
    
    this.updateAllMarkerAppearances();
    this.notifySelectionChange();
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    if (this.selectedIds.size > 0) {
      this.selectedIds.clear();
      this.updateAllMarkerAppearances();
      this.notifySelectionChange();
      console.log('🗑️ AnnotationManager: Cleared selection');
    }
  }

  /**
   * Get array of selected annotation IDs
   */
  getSelected(): string[] {
    return Array.from(this.selectedIds);
  }

  /**
   * Check if an annotation is selected
   */
  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  /**
   * Update marker scales for consistent screen-space size
   * Should be called in the render loop
   * @param camera - Current camera (perspective or orthographic)
   * @param canvasHeight - Height of the canvas in pixels
   */
  updateMarkerScales(camera: THREE.Camera, canvasHeight: number): void {
    const pixelSize = this.config.markerSize;
    
    for (const marker of this.markers.values()) {
      let scale: number;
      
      if (camera instanceof THREE.PerspectiveCamera) {
        // Perspective: scale based on distance and FOV
        const distance = camera.position.distanceTo(marker.position);
        const fovRadians = camera.fov * Math.PI / 180;
        scale = distance * Math.tan(fovRadians / 2) * 2 * pixelSize / canvasHeight;
      } else if (camera instanceof THREE.OrthographicCamera) {
        // Orthographic: scale based on frustum size (no perspective)
        const visibleHeight = camera.top - camera.bottom;
        scale = visibleHeight * pixelSize / canvasHeight;
      } else {
        // Fallback for unknown camera types
        scale = 0.01;
      }
      
      marker.scale.set(scale, scale, scale);
    }
  }

  /**
   * Get the marker mesh for an annotation (for raycasting)
   */
  getMarker(id: string): THREE.Mesh | undefined {
    return this.markers.get(id);
  }

  /**
   * Get all marker meshes (for raycasting)
   */
  getAllMarkers(): THREE.Mesh[] {
    return Array.from(this.markers.values());
  }

  /**
   * Find annotation ID from a marker mesh
   */
  getAnnotationIdFromMarker(marker: THREE.Mesh): string | null {
    for (const [id, mesh] of this.markers.entries()) {
      if (mesh === marker) return id;
    }
    return null;
  }

  /**
   * Register a callback for selection changes
   * @param callback - Function to call when selection changes
   * @returns Unsubscribe function
   */
  onSelectionChange(callback: SelectionChangeCallback): () => void {
    this.selectionCallbacks.push(callback);
    return () => {
      const index = this.selectionCallbacks.indexOf(callback);
      if (index > -1) {
        this.selectionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Enable picking mode for creating new annotations
   * @param callback - Function to call when a point is picked
   */
  enablePicking(callback: PointPickedCallback): void {
    this.pickCallback = callback;
    console.log('✏️ AnnotationManager: Picking mode enabled');
  }

  /**
   * Disable picking mode
   */
  disablePicking(): void {
    this.pickCallback = null;
    console.log('✏️ AnnotationManager: Picking mode disabled');
  }

  /**
   * Check if picking mode is active
   */
  isPickingMode(): boolean {
    return this.pickCallback !== null;
  }

  /**
   * Notify picking callback with a point
   * @param point - 3D point coordinates
   */
  notifyPointPicked(point: [number, number, number]): void {
    if (this.pickCallback) {
      this.pickCallback(point);
      console.log('📍 AnnotationManager: Point picked:', point);
    }
  }

  /**
   * Update configuration
   * @param config - Partial configuration to merge with current config
   */
  updateConfig(config: Partial<AnnotationConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateAllMarkerAppearances();
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<AnnotationConfig> {
    return { ...this.config };
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Remove all markers from scene
    for (const [id, marker] of this.markers.entries()) {
      this.removeMarker(id);
    }
    
    // Clear callbacks
    this.selectionCallbacks = [];
    this.pickCallback = null;
    
    console.log('🗑️ AnnotationManager: Disposed');
  }

  // ==================== Private Methods ====================

  /**
   * Create a new marker mesh
   */
  private createMarker(position: THREE.Vector3, isSelected: boolean): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(1.0, this.config.sphereSegments, this.config.sphereSegments);
    const material = new THREE.MeshBasicMaterial({
      color: isSelected ? this.config.selectedColor : this.config.color,
      transparent: true,
      opacity: isSelected ? this.config.selectedOpacity : this.config.opacity,
      depthTest: true,
      depthWrite: true
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    
    return mesh;
  }

  /**
   * Update a marker's appearance based on selection state
   */
  private updateMarkerAppearance(marker: THREE.Mesh, isSelected: boolean): void {
    const material = marker.material as THREE.MeshBasicMaterial;
    material.color.setHex(isSelected ? this.config.selectedColor : this.config.color);
    material.opacity = isSelected ? this.config.selectedOpacity : this.config.opacity;
  }

  /**
   * Update all markers' appearances based on current selection
   */
  private updateAllMarkerAppearances(): void {
    for (const [id, marker] of this.markers.entries()) {
      const isSelected = this.selectedIds.has(id);
      this.updateMarkerAppearance(marker, isSelected);
    }
  }

  /**
   * Remove a marker from the scene
   */
  private removeMarker(id: string): void {
    const marker = this.markers.get(id);
    if (marker) {
      this.scene.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
      this.markers.delete(id);
    }
  }

  /**
   * Notify all selection change callbacks
   */
  private notifySelectionChange(): void {
    const selectedIds = this.getSelected();
    this.selectionCallbacks.forEach(callback => {
      try {
        callback(selectedIds);
      } catch (error) {
        console.error('Error in selection change callback:', error);
      }
    });
  }
}
