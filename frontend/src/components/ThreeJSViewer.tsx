import React, { useRef, useEffect } from 'react';
import { ThreePresenter, SceneDescription } from './ThreePresenter';

// React wrapper for ThreePresenter
export default function ThreeJSViewer({ width = '100%', height = '100%', sceneDesc }: { width?: string | number; height?: string | number; sceneDesc?: SceneDescription }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<ThreePresenter | null>(null);

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
