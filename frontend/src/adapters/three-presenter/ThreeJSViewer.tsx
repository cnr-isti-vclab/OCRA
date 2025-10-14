import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ThreePresenter, AnnotationManager } from '../../lib/three-presenter/src';
import type { SceneDescription } from '../../lib/three-presenter/src/types/SceneTypes';
import type { Annotation } from '../../../../shared/scene-types';
import { OcraFileUrlResolver } from './OcraFileUrlResolver';

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
      }
    }));

    // Initialize presenter on mount
    useEffect(() => {
      if (!mountRef.current) return;
      
      console.log('🎬 Initializing ThreePresenter with OcraFileUrlResolver');
      // Create OCRA file URL resolver for loading models from OCRA API
      const fileResolver = new OcraFileUrlResolver();
      presenterRef.current = new ThreePresenter(mountRef.current, fileResolver);
      
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
        
        presenterRef.current.loadScene(sceneDesc, false)
          .then(() => {
            // Show UI buttons after scene is loaded (they're hidden by default)
            if (presenterRef.current) {
              presenterRef.current.setButtonVisible('home', true);
              presenterRef.current.setButtonVisible('light', true);
              presenterRef.current.setButtonVisible('lightPosition', true);
              presenterRef.current.setButtonVisible('env', true);
              presenterRef.current.setButtonVisible('screenshot', true);
              presenterRef.current.setButtonVisible('camera', true);
              // Note: 'annotation' button visibility is controlled separately via setAnnotationButtonVisible()
            }
          })
          .catch(err => {
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