import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ThreePresenter, SceneDescription } from './ThreePresenter';

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
}

// React wrapper for ThreePresenter
const ThreeJSViewer = forwardRef<ThreeJSViewerRef, { width?: string | number; height?: string | number; sceneDesc?: SceneDescription }>(
  ({ width = '100%', height = '100%', sceneDesc }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const presenterRef = useRef<ThreePresenter | null>(null);

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
      
      console.log('🔄 Loading scene from sceneDesc');
      presenterRef.current.loadScene(sceneDesc).catch(err => {
        console.error('Failed to load scene:', err);
      });
    }, [sceneDesc]);

    return <div ref={mountRef} style={{ width, height, position: 'relative' }} />;
  }
);

ThreeJSViewer.displayName = 'ThreeJSViewer';

export default ThreeJSViewer;