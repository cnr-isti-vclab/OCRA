import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ThreePresenter, SceneDescription } from './ThreePresenter';

export interface ThreeJSViewerRef {
  setMeshVisibility: (meshName: string, visible: boolean) => void;
  getMeshVisibility: (meshName: string) => boolean;
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