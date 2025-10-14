import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ThreePresenter, SceneDescription, AnnotationManager } from './ThreePresenter';
import type { Annotation } from '../../../shared/scene-types';

export interface ThreeJSViewerRef {
  setMeshVisibility: (meshName: string, visible: boolean) => void;
  getMeshVisibility: (meshName: string) => boolean;
  getModelStats: (modelId: string) => { triangles: number; vertices: number; bbox: { x: number; y: number; z: number }; textures: { count: number; dimensions: Array<{ width: number; height: number }> } } | null;
  applyModelTransform: (
    modelId: string,
    position?: [number, number, number] | null,
    rotation?: [number, number, number] | null,
    scale?: number | [number, number, number] | null
  ) => void;
  setAnnotationButtonVisible: (visible: boolean) => void;
  setOnPointPicked: (callback: ((point: [number, number, number]) => void) | null) => void;
  getAnnotationManager: () => AnnotationManager;
  // Efficient environment setters (no scene reload)
  setBackgroundColor: (color: string) => void;
  setGroundVisible: (visible: boolean) => void;
  setHeadLightOffset: (thetaDeg: number, phiDeg: number) => void;
  /** @deprecated Use getAnnotationManager().render() instead */
  renderAnnotations: (annotations: Annotation[]) => void;
  /** @deprecated Use getAnnotationManager().getSelected() instead */
  getSelectedAnnotations: () => string[];
  /** @deprecated Use getAnnotationManager().select() instead */
  selectAnnotation: (annotationId: string, additive?: boolean) => void;
  /** @deprecated Use getAnnotationManager().clearSelection() instead */
  clearAnnotationSelection: () => void;
}

// React wrapper for ThreePresenter
const ThreeJSViewer = forwardRef<ThreeJSViewerRef, { width?: string | number; height?: string | number; sceneDesc?: SceneDescription }>(
  ({ width = '100%', height = '100%', sceneDesc }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const presenterRef = useRef<ThreePresenter | null>(null);
    const isFirstLoadRef = useRef<boolean>(true);
    const prevSceneRef = useRef<SceneDescription | null>(null);

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      setMeshVisibility: (meshName: string, visible: boolean) => {
        presenterRef.current?.setModelVisibility(meshName, visible);
      },
      getMeshVisibility: (meshName: string) => {
        return presenterRef.current?.getModelVisibilityById(meshName) ?? false;
      },
      getModelStats: (modelId: string) => {
        return presenterRef.current?.getModelStats(modelId) ?? null;
      },
      applyModelTransform: (
        modelId: string,
        position?: [number, number, number] | null,
        rotation?: [number, number, number] | null,
        scale?: number | [number, number, number] | null
      ) => {
        presenterRef.current?.applyModelTransform(modelId, position, rotation, scale);
      },
      setAnnotationButtonVisible: (visible: boolean) => {
        presenterRef.current?.setAnnotationButtonVisible(visible);
      },
      setOnPointPicked: (callback: ((point: [number, number, number]) => void) | null) => {
        if (presenterRef.current) {
          presenterRef.current.onPointPicked = callback;
        }
      },
      getAnnotationManager: () => {
        if (!presenterRef.current) {
          throw new Error('ThreePresenter not initialized');
        }
        return presenterRef.current.getAnnotationManager();
      },
      setBackgroundColor: (color: string) => {
        presenterRef.current?.setBackgroundColor(color);
      },
      setGroundVisible: (visible: boolean) => {
        presenterRef.current?.setGroundVisible(visible);
      },
      setHeadLightOffset: (thetaDeg: number, phiDeg: number) => {
        presenterRef.current?.setHeadLightOffset(thetaDeg, phiDeg);
      },
      renderAnnotations: (annotations: Annotation[]) => {
        presenterRef.current?.renderAnnotations(annotations);
      },
      getSelectedAnnotations: () => {
        return presenterRef.current?.getSelectedAnnotations() ?? [];
      },
      selectAnnotation: (annotationId: string, additive: boolean = false) => {
        presenterRef.current?.selectAnnotation(annotationId, additive);
      },
      clearAnnotationSelection: () => {
        presenterRef.current?.clearAnnotationSelection();
      }
    }));

    // Initialize presenter on mount
    useEffect(() => {
      if (!mountRef.current) return;
      
      console.log('🎬 Initializing ThreePresenter');
      presenterRef.current = new ThreePresenter(mountRef.current);
      
      return () => {
        console.log('🛑 Disposing ThreePresenter');
        presenterRef.current?.dispose();
      };
    }, []);

    // Load/reload scene when sceneDesc changes
    useEffect(() => {
      if (!sceneDesc || !presenterRef.current) return;
      
      const prevScene = prevSceneRef.current;
      
      // Determine if we need a full reload
      let needsReload = isFirstLoadRef.current;
      
      if (!isFirstLoadRef.current && prevScene) {
        // Check if model file paths changed (which requires reloading the models)
        const currentFiles = (sceneDesc.models || []).map(m => `${m.id}:${m.file}`).sort().join('|');
        const previousFiles = (prevScene.models || []).map(m => `${m.id}:${m.file}`).sort().join('|');
        const filesChanged = currentFiles !== previousFiles;
        
        // Only reload if file paths changed
        needsReload = filesChanged;
      }
      
      if (needsReload) {
        if (isFirstLoadRef.current) {
          console.log('🔄 Loading scene (initial load)');
        } else {
          console.log('🔄 Loading scene (model files changed)');
        }
        
        presenterRef.current.loadScene(sceneDesc, false).catch(err => {
          console.error('Failed to load scene:', err);
        });
        
        isFirstLoadRef.current = false;
      } else {
        console.log('⚡ Skipping scene reload (no file changes - use direct setters for other changes)');
      }
      
      // Store current scene for next comparison
      prevSceneRef.current = sceneDesc;
    }, [sceneDesc]);

    return <div ref={mountRef} style={{ width, height, position: 'relative' }} />;
  }
);

ThreeJSViewer.displayName = 'ThreeJSViewer';

export default ThreeJSViewer;