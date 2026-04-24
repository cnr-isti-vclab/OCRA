import React, { useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { ThreePresenter, AnnotationManager, LoadingProgress, DefaultUI } from 'three-presenter';
import type { SceneDescription } from 'three-presenter';
import type { Annotation } from 'shared/scene-types';
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
  renderAnnotations: (annotations: Annotation[]) => void;
  // Efficient environment setters (no scene reload)
  setBackgroundColor: (color: string) => void;
  setGroundVisible: (visible: boolean) => void;
  setHeadLightOffset: (thetaDeg: number, phiDeg: number) => void;
}

// React wrapper for ThreePresenter
const ThreeJSViewer = forwardRef<ThreeJSViewerRef, {
  width?: string | number;
  height?: string | number;
  sceneDesc?: SceneDescription;
  onReady?: () => void; // Callback fired when presenter is initialized and ready
  onLoadProgress?: (progress: LoadingProgress) => void; // Model loading progress
  onLoadComplete?: (modelId: string) => void; // Model loading complete
  onLoadError?: (modelId: string, error: Error) => void; // Model loading error
}>(
  ({ width = '100%', height = '100%', sceneDesc, onReady, onLoadProgress, onLoadComplete, onLoadError }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const presenterRef = useRef<ThreePresenter | null>(null);
    const uiRef = useRef<DefaultUI | null>(null);
    const isFirstLoadRef = useRef<boolean>(true);
    const prevSceneRef = useRef<SceneDescription | null>(null);
    const onReadyRef = useRef(onReady);

    // Keep onReady ref up-to-date without affecting presenter lifecycle
    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

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
        uiRef.current?.setButtonVisible('annotation', visible);
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
        if (!presenterRef.current) return;
        presenterRef.current.getAnnotationManager().render(annotations);
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
      presenterRef.current = new ThreePresenter({
        mount: mountRef.current,
        fileUrlResolver: fileResolver
      });

      // Initialize default UI overlay
      uiRef.current = new DefaultUI(presenterRef.current/*, {
        container: {
          position: 'top-left'
        }
      }*/);

      // Notify parent that presenter is ready
      if (onReadyRef.current) {
        onReadyRef.current();
      }

      return () => {
        console.log('🛑 Disposing ThreePresenter');
        uiRef.current?.dispose();
        presenterRef.current?.dispose();
      };
    }, []);

    // Update callbacks when they change (without recreating presenter)
    useEffect(() => {
      if (presenterRef.current) {
        presenterRef.current.onLoadProgress = onLoadProgress;
        presenterRef.current.onLoadComplete = onLoadComplete;
        presenterRef.current.onLoadError = onLoadError;
      }
    }, [onLoadProgress, onLoadComplete, onLoadError]);

    // Filter sceneDesc to exclude annotations (3D viewer doesn't need them for model loading)
    const filteredSceneDesc = useMemo(() => {
      if (!sceneDesc) return null;
      
      function is3dmodel(model: any): boolean {
        const lower = (model.file as string).toLowerCase();
        const is3d = (lower.endsWith('.ply') ||
                      lower.endsWith('.obj') ||
                      lower.endsWith('.glb') ||
                      lower.endsWith('.gltf') ||
                      lower.endsWith('.nxs') ||
                      lower.endsWith('.nxz'));
        return is3d;
      }
      // Create a copy without annotations to prevent unnecessary reloads when annotations change
      const filtered = { ...sceneDesc };
      // Remove any models that don't have 3D file extensions, 
      // it should be done at the API level but just in case to prevent loading issues
      filtered.models = sceneDesc.models.filter(a => is3dmodel(a)); 
      delete filtered.annotations;
      return filtered;
    }, [sceneDesc?.models, sceneDesc?.environment, sceneDesc?.projectId, sceneDesc?.enableControls, sceneDesc?.rotationUnits]);

    // Load/reload scene when filteredSceneDesc changes
    useEffect(() => {
      if (!filteredSceneDesc || !presenterRef.current) return;

      // 🔍 DEBUG: Logga la scene description ricevuta
      console.log('🎭 [ThreeJSViewer] Scene description received (models only):', JSON.stringify(filteredSceneDesc, null, 2));

      const prevScene = prevSceneRef.current;

      // Determine if we need a full reload
      let needsReload = isFirstLoadRef.current;

      if (!isFirstLoadRef.current && prevScene) {
        // Check if model file paths changed (which requires reloading the models)
        const currentFiles = (filteredSceneDesc.models || []).map(m => `${m.id}:${m.file}`).sort().join('|');
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

        presenterRef.current.loadScene(filteredSceneDesc, false)
          .then(() => {
            // Show UI buttons after scene is loaded (they're hidden by default)
            if (presenterRef.current && uiRef.current) {
              uiRef.current.setButtonVisible('home', true);
              uiRef.current.setButtonVisible('light', true);
              uiRef.current.setButtonVisible('lightPosition', true);
              uiRef.current.setButtonVisible('env', true);
              uiRef.current.setButtonVisible('screenshot', true);
              uiRef.current.setButtonVisible('camera', true);
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
      prevSceneRef.current = filteredSceneDesc;
    }, [filteredSceneDesc]);

    return <div ref={mountRef} style={{ width, height, position: 'relative' }} />;
  }
);

ThreeJSViewer.displayName = 'ThreeJSViewer';

export default ThreeJSViewer;