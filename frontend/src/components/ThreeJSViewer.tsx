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
        presenterRef.current?.setMeshVisibility(meshName, visible);
      },
      getMeshVisibility: (meshName: string) => {
        return presenterRef.current?.getMeshVisibility(meshName) ?? false;
      }
    }));

    useEffect(() => {
      if (!mountRef.current) return;
      presenterRef.current = new ThreePresenter(mountRef.current);
      if (sceneDesc) {
        presenterRef.current.setScene(sceneDesc);
      }
      return () => {
        presenterRef.current?.dispose();
      };
      // Only run on mount/unmount
      // eslint-disable-next-line
    }, []);

    // Update scene if sceneDesc changes
    useEffect(() => {
      if (sceneDesc && presenterRef.current) {
        presenterRef.current.setScene(sceneDesc);
      }
    }, [sceneDesc]);

    return <div ref={mountRef} style={{ width, height, position: 'relative' }} />;
  }
);

ThreeJSViewer.displayName = 'ThreeJSViewer';

export default ThreeJSViewer;