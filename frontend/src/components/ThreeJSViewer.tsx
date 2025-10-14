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
      
      // Check if models were added/removed by comparing model counts
      const currentModelCount = sceneDesc.models?.length || 0;
      const previousModelCount = presenterRef.current.currentScene?.models?.length || 0;
      const modelsChanged = isFirstLoadRef.current || currentModelCount !== previousModelCount;
      
      const preserveCamera = !modelsChanged;
      if (preserveCamera) {
        console.log('🔄 Reloading scene (preserving camera - no model changes)');
      } else {
        console.log(`🔄 Loading scene (${isFirstLoadRef.current ? 'initial load' : 'models changed: ' + previousModelCount + ' → ' + currentModelCount})`);
      }
      
      presenterRef.current.loadScene(sceneDesc, preserveCamera).catch(err => {
        console.error('Failed to load scene:', err);
      });
      
      isFirstLoadRef.current = false;
    }, [sceneDesc]);

    return <div ref={mountRef} style={{ width, height, position: 'relative' }} />;
  }
);

ThreeJSViewer.displayName = 'ThreeJSViewer';

export default ThreeJSViewer;