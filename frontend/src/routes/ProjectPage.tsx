import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, Link } from 'react-router-dom';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../adapters/three-presenter/ThreeJSViewer';
import { LoadingProgress } from 'three-presenter';
import { getApiBase } from '../config/oauth';
import type { SceneDescription, Annotation } from '../../../shared/scene-types';

interface Project {
  id: string;
  name: string;
  description?: string;
  public: boolean;
  createdAt: string;
  updatedAt: string;
  manager?: {
    id: string;
    name?: string;
    email: string;
    username?: string;
    displayName: string;
  } | null;
}

// Minimal type to read the 3D model defined in HDT metadata
interface HDTModelMeta {
  fileName: string;
  fileUrl?: string;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isManager, setIsManager] = useState<boolean>(false);
  const [files, setFiles] = useState<Array<{ name: string; url: string; size?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sceneDesc, setSceneDesc] = useState<SceneDescription | null>(null);
  const [availableScenes, setAvailableScenes] = useState<Array<{ id: string; label: string; isDefault?: boolean }>>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [meshVisibility, setMeshVisibility] = useState<Record<string, boolean>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'models' | 'annotations' | 'scene'>('scene');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editedPosition, setEditedPosition] = useState<string>('');
  const [editedRotation, setEditedRotation] = useState<string>('');
  const [editedScale, setEditedScale] = useState<string>('');

  // Local state for environment settings (to avoid re-initializing viewer)
  const [showGround, setShowGround] = useState<boolean>(false);
  const [backgroundColor, setBackgroundColor] = useState<string>('#404040');
  const [headlightOffset, setHeadlightOffset] = useState<[number, number]>([0, 0]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [downloadingRdf, setDownloadingRdf] = useState(false);
  const [hdtModel, setHdtModel] = useState<HDTModelMeta | null>(null);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [modelLoadProgress, setModelLoadProgress] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeJSViewerRef>(null);

  // Ensure HDT document and default scene exist before updating
  const ensureHDTDocument = async (projectId: string): Promise<boolean> => {
    try {
      // Check if HDT document exists
      const checkRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
        credentials: 'include'
      });

      if (checkRes.ok) {
        return true; // Already exists
      }

      if (checkRes.status === 404) {
        // Create HDT document with default scene
        console.log('📝 Creating HDT document for new project...');
        const createRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: {
              dublinCore: {},
              cidocCrm: {}
            }
          })
        });

        if (!createRes.ok) {
          console.error('Failed to create HDT document');
          return false;
        }

        console.log('✅ HDT document created successfully');
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error ensuring HDT document:', err);
      return false;
    }
  };

  // Download RDF export
  const handleDownloadRdf = async () => {
    if (!projectId) return;

    setDownloadingRdf(true);
    try {
      // Create a temporary anchor element to trigger download
      const url = `${getApiBase()}/api/projects/${projectId}/export/rdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `hdt-${projectId}.rdf`;
      a.style.display = 'none';

      // Add to DOM and click
      document.body.appendChild(a);
      a.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);

    } catch (err: any) {
      console.error('Error downloading RDF:', err);
      alert('Failed to download RDF export: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloadingRdf(false);
    }
  };

  // Toggle mesh visibility
  const toggleMeshVisibility = (meshName: string) => {
    const newVisibility = !meshVisibility[meshName];
    setMeshVisibility(prev => ({ ...prev, [meshName]: newVisibility }));
    viewerRef.current?.setMeshVisibility(meshName, newVisibility);
  };

  // Cycle through models, showing one at a time
  const cycleModels = () => {
    if (!sceneDesc?.models || sceneDesc.models.length === 0) return;

    const modelIds = sceneDesc.models.map((m: any) => m.id);

    // Find the first visible model
    let currentVisibleIndex = modelIds.findIndex((id: string) => meshVisibility[id] !== false);

    // If no model is visible, start from -1 to show the first model
    if (currentVisibleIndex === -1) {
      currentVisibleIndex = -1;
    }

    // Calculate next index (wrap around to 0 if at the end)
    const nextIndex = (currentVisibleIndex + 1) % modelIds.length;

    // Create new visibility state: hide all except the next one
    const newVisibility: Record<string, boolean> = {};
    modelIds.forEach((id: string, index: number) => {
      newVisibility[id] = index === nextIndex;
    });

    // Update state and viewer
    setMeshVisibility(newVisibility);
    modelIds.forEach((id: string, index: number) => {
      viewerRef.current?.setMeshVisibility(id, index === nextIndex);
    });
  };

  // Toggle model info display
  const toggleModelInfo = (modelId: string) => {
    setSelectedModelId(prev => prev === modelId ? null : modelId);
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Start editing a model
  const startEditingModel = (modelId: string, sceneModel: any) => {
    setEditingModelId(modelId);
    setSaveError(null);
    // Initialize edit fields with current values or defaults
    if (sceneModel?.position) {
      setEditedPosition(sceneModel.position.join(', '));
    } else {
      setEditedPosition('0, 0, 0');
    }
    if (sceneModel?.rotation) {
      setEditedRotation(sceneModel.rotation.join(', '));
    } else {
      setEditedRotation('0, 0, 0');
    }
    if (sceneModel?.scale !== undefined) {
      if (Array.isArray(sceneModel.scale)) {
        setEditedScale(sceneModel.scale.join(', '));
      } else {
        setEditedScale(String(sceneModel.scale));
      }
    } else {
      setEditedScale('1');
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    // Restore original transformation from scene
    if (editingModelId && sceneDesc) {
      const sceneModel = sceneDesc.models?.find((m: any) => m.id === editingModelId);
      if (sceneModel && viewerRef.current) {
        // Convert rotation from degrees to radians
        let rotation: [number, number, number] | null = null;
        if (sceneModel.rotation) {
          rotation = [
            sceneModel.rotation[0] * Math.PI / 180,
            sceneModel.rotation[1] * Math.PI / 180,
            sceneModel.rotation[2] * Math.PI / 180
          ];
        }

        viewerRef.current.applyModelTransform(
          editingModelId,
          sceneModel.position || null,
          rotation,
          sceneModel.scale !== undefined ? sceneModel.scale : null
        );
      }
    }

    setEditingModelId(null);
    setSaveError(null);
    setEditedPosition('');
    setEditedRotation('');
    setEditedScale('');
  };

  // Apply transformations live as user types (without saving)
  const applyLiveTransform = (modelId: string, posStr: string, rotStr: string, scaleStr: string) => {
    if (!viewerRef.current) return;

    try {
      const parseArray = (str: string): [number, number, number] | null => {
        const trimmed = str.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(',').map(p => parseFloat(p.trim()));
        if (parts.some(isNaN) || parts.length !== 3) return null;
        return parts as [number, number, number];
      };

      const position = parseArray(posStr);

      // Parse rotation and convert degrees to radians for Three.js
      const rotationDeg = parseArray(rotStr);
      const rotation = rotationDeg ? [
        rotationDeg[0] * Math.PI / 180,
        rotationDeg[1] * Math.PI / 180,
        rotationDeg[2] * Math.PI / 180
      ] as [number, number, number] : null;

      let scale: number | [number, number, number] | null = null;
      const trimmedScale = scaleStr.trim();
      if (trimmedScale) {
        if (trimmedScale.includes(',')) {
          scale = parseArray(trimmedScale);
        } else {
          const scaleNum = parseFloat(trimmedScale);
          if (!isNaN(scaleNum)) scale = scaleNum;
        }
      }

      viewerRef.current.applyModelTransform(modelId, position, rotation, scale);
    } catch (err) {
      // Silently ignore parse errors during live editing
      console.debug('Parse error during live transform:', err);
    }
  };

  // Save edited model properties
  const saveModelProperties = async (modelId: string, fileName: string) => {
    setSaveError(null);
    try {
      // Parse the input values
      const parseArray = (str: string): [number, number, number] | null => {
        const trimmed = str.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(',').map(p => parseFloat(p.trim()));
        if (parts.some(isNaN)) throw new Error('Invalid number format');
        if (parts.length !== 3) throw new Error('Position and rotation must have exactly 3 values');
        return parts as [number, number, number];
      };

      const position = parseArray(editedPosition);
      const rotation = parseArray(editedRotation);
      let scale: number | [number, number, number] | undefined = undefined;

      const scaleStr = editedScale.trim();
      if (scaleStr) {
        if (scaleStr.includes(',')) {
          const scaleArray = parseArray(scaleStr);
          if (scaleArray) scale = scaleArray;
        } else {
          const scaleNum = parseFloat(scaleStr);
          if (isNaN(scaleNum)) throw new Error('Invalid scale value');
          scale = scaleNum;
        }
      }

      // Update the scene description
      const updatedScene = { ...sceneDesc } as SceneDescription;
      if (!updatedScene.models) updatedScene.models = [];

      // Ensure rotation units are specified as degrees
      updatedScene.rotationUnits = 'deg';

      // Find or create the model entry - improved HDT-compatible matching
      let modelIndex = updatedScene.models.findIndex((m: any) => {
        // Direct ID match
        if (m.id === modelId) return true;
        // Legacy direct file match
        if (m.file === fileName) return true;
        // HDT URL matching: check if URL ends with filename
        if (typeof m.file === 'string' && m.file.includes('/') && m.file.endsWith('/' + fileName)) return true;
        return false;
      });
      if (modelIndex === -1) {
        // Only create new model if no existing model found
        // This should NOT happen with HDT scenes, but keep as fallback
        console.warn(`⚠️ Creating new model entry for ${modelId}/${fileName} - this may indicate a matching issue`);
        updatedScene.models.push({
          id: modelId,
          file: fileName,
          ...(position && { position }),
          ...(rotation && { rotation }),
          ...(scale !== undefined && { scale })
        });
      } else {
        // Update existing model
        const model = updatedScene.models[modelIndex] as any;
        if (position) model.position = position;
        else delete model.position;

        if (rotation) model.rotation = rotation;
        else delete model.rotation;

        if (scale !== undefined) model.scale = scale;
        else delete model.scale;
      }

      // Ensure HDT document exists before saving
      if (!await ensureHDTDocument(projectId!)) {
        throw new Error('Failed to ensure HDT document exists');
      }

      // Save to backend using HDT scenes endpoint
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedScene)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save changes');
      }

      // Update local state
      setSceneDesc(updatedScene);

      // Exit edit mode
      setEditingModelId(null);

      // Reload the scene in the viewer without resetting camera
      if (viewerRef.current) {
        // The viewer will reload with the updated scene description
        // Camera position is preserved since we're not reloading the page
      }

    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save changes');
    }
  };

  // Fetch project info, user info, and file list
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch project
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch project');
        const data = await response.json();
        setProject(data.project);
        // Fetch user
        const userData = await getCurrentUser();
        setUser(userData);
        // Fetch files
        const filesRes = await fetch(`${getApiBase()}/api/projects/${projectId}/files`, {
          credentials: 'include'
        });
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          console.log('📁 Files received from API:', filesData.files);
          setFiles(filesData.files || []);
        } else {
          setFiles([]);
        }
        // Fetch is-manager
        const isManagerRes = await fetch(`${getApiBase()}/api/projects/${projectId}/is-manager`, {
          credentials: 'include'
        });
        if (isManagerRes.ok) {
          const mgr = await isManagerRes.json();
          setIsManager(!!mgr.isManager);
        } else {
          setIsManager(false);
        }

        // Fetch available scenes (new multi-scene architecture)
        try {
          const scenesListRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scenes`, {
            credentials: 'include'
          });
          if (scenesListRes.ok) {
            const scenesListJson: any = await scenesListRes.json();

            // Backend may return either an array (new API) or { scenes: [...] } (legacy wrapper)
            const scenesArray: any[] = Array.isArray(scenesListJson)
              ? scenesListJson
              : (Array.isArray(scenesListJson?.scenes) ? scenesListJson.scenes : []);

            if (scenesArray.length > 0) {
              setAvailableScenes(scenesArray);

              const defaultScene = scenesArray.find((s: any) => s.isDefault);
              const initialSceneId = defaultScene?.id || scenesArray[0]?.id;

              if (initialSceneId && !selectedSceneId) {
                setSelectedSceneId(initialSceneId);
              }
            } else {
              // No scenes found - fallback to a virtual default scene
              const defaultScene = { id: 'default', label: 'Default Scene', isDefault: true };
              setAvailableScenes([defaultScene]);
              if (!selectedSceneId) setSelectedSceneId('default');
            }
          } else {
            // API error - fallback to default empty scene
            const defaultScene = {
              id: 'default',
              label: 'Default Scene',
              isDefault: true
            };
            setAvailableScenes([defaultScene]);
            if (!selectedSceneId) {
              setSelectedSceneId('default');
            }
          }
        } catch (err) {
          console.warn('Could not fetch scenes list:', err);
          // Error - fallback to default empty scene
          const defaultScene = {
            id: 'default',
            label: 'Default Scene',
            isDefault: true
          };
          setAvailableScenes([defaultScene]);
          if (!selectedSceneId) {
            setSelectedSceneId('default');
          }
        }

        // Fetch scene.json (legacy single scene or selected scene)
        const sceneEndpoint = selectedSceneId
          ? `${getApiBase()}/api/projects/${projectId}/scenes/${selectedSceneId}`
          : `${getApiBase()}/api/projects/${projectId}/scenes/default`;
        const sceneRes = await fetch(sceneEndpoint, {
          credentials: 'include'
        });
        let fetchedScene: SceneDescription | null = null;
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          // Add projectId to scene if not present
          if (!scene.projectId) {
            scene.projectId = projectId;
          }
          fetchedScene = scene;
          setSceneDesc(scene);
          // Load annotations from scene
          setAnnotations(scene.annotations || []);
          // Initialize visibility state for all models (all visible by default)
          const initialVisibility: Record<string, boolean> = {};
          if (scene.models) {
            scene.models.forEach((model: any) => {
              initialVisibility[model.id] = model.visible !== false;
            });
          }
          setMeshVisibility(initialVisibility);
        } else {
          setSceneDesc(null);
          setAnnotations([]);
        }

        // Fetch HDT metadata (read-only): keep a reference for UI, do NOT inject models into the scene.
        // The scene models must come only from /api/projects/:projectId/scenes/:sceneId (MongoDB source of truth).
        try {
          const hdtRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
            credentials: 'include',
          });

          if (hdtRes.ok) {
            const doc: any = await hdtRes.json();

            // Pick a 3D asset from digitalAssets (new architecture)
            const assets: any[] = Array.isArray(doc?.digitalAssets) ? doc.digitalAssets : [];
            const modelAsset =
              assets.find((a: any) => a?.type === '3d-model') ||
              assets.find((a: any) => typeof a?.type === 'string' && a.type.includes('3d'));

            // Keep a minimal reference for UI purposes only (no scene mutation here).
            if (modelAsset?.entryPoint) {
              setHdtModel({
                fileName: modelAsset.entryPoint,
                fileUrl: modelAsset.entryPointUrl,
              });
            } else {
              setHdtModel(null);
            }
          }
        } catch (e) {
          console.warn('Could not fetch HDT metadata:', e);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchAll();
    // eslint-disable-next-line
  }, [projectId]);

  // Reload scene when selected scene changes
  useEffect(() => {
    const loadSelectedScene = async () => {
      if (!projectId || !selectedSceneId) return;

      try {
        // Use endpoint that always regenerates from MongoDB (source of truth)
        const sceneRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scenes/${selectedSceneId}`, {
          credentials: 'include'
        });

        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          console.log('📥 Scene loaded from backend:', scene.environment);
          // Add projectId to scene if not present
          if (!scene.projectId) {
            scene.projectId = projectId;
          }
          setSceneDesc(scene);

          // Initialize local environment settings from scene
          setShowGround(scene.environment?.showGround ?? false);
          setBackgroundColor(scene.environment?.background || '#404040');
          setHeadlightOffset(scene.environment?.headLightOffset || [0, 0]);

          // Load annotations from scene
          setAnnotations(scene.annotations || []);
          // Initialize visibility state for all models
          const initialVisibility: Record<string, boolean> = {};
          if (scene.models) {
            scene.models.forEach((model: any) => {
              initialVisibility[model.id] = model.visible !== false;
            });
          }
          setMeshVisibility(initialVisibility);
        }
      } catch (err) {
        console.error('Failed to load selected scene:', err);
      }
    };

    loadSelectedScene();
  }, [projectId, selectedSceneId]);

  // Show/hide annotation button based on active tab
  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.setAnnotationButtonVisible(activeTab === 'annotations');
    }
  }, [activeTab]);

  // Set up annotation point picking callback when viewer is ready
  const setupAnnotationCallback = useCallback(() => {
    if (!viewerRef.current || !projectId) {
      return;
    }

    viewerRef.current.setOnPointPicked((point: [number, number, number]) => {
      // Create a new annotation
      const newAnnotation: Annotation = {
        id: `annotation-${Date.now()}`,
        label: `Point ${Date.now()}`,
        type: 'point',
        geometry: point,
        createdAt: new Date().toISOString()
      };

      // Add to state - using functional update to get latest state
      setAnnotations(prevAnnotations => {
        const updatedAnnotations = [...prevAnnotations, newAnnotation];

        // Save to backend - use functional update to get latest sceneDesc
        setSceneDesc(currentSceneDesc => {
          if (currentSceneDesc) {
            const updatedScene = {
              ...currentSceneDesc,
              annotations: updatedAnnotations
            };

            // Ensure HDT document exists before saving
            ensureHDTDocument(projectId).then(exists => {
              if (!exists) {
                console.error('Failed to ensure HDT document exists');
                return;
              }

              fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedScene)
              }).then(response => {
                if (!response.ok) {
                  console.error('Failed to save annotations');
                }
              }).catch(error => {
                console.error('Error saving annotations:', error);
              });
            });
          }
          return currentSceneDesc; // Don't update sceneDesc here
        });

        return updatedAnnotations;
      });
    });
  }, [projectId, selectedSceneId]);

  // Set up callback when dependencies change (after viewer is ready)
  useEffect(() => {
    setupAnnotationCallback();
  }, [setupAnnotationCallback]);

  // Render annotations in 3D viewer when they change
  useEffect(() => {
    if (viewerRef.current && annotations.length >= 0) {
      viewerRef.current.getAnnotationManager().render(annotations);
    }
  }, [annotations]);

  // Poll viewer for annotation selection changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewerRef.current) {
        const selectedIds = viewerRef.current.getAnnotationManager().getSelected();
        // Only update state if selection actually changed
        if (JSON.stringify(selectedIds) !== JSON.stringify(selectedAnnotationIds)) {
          setSelectedAnnotationIds(selectedIds);
        }
      }
    }, 200); // Poll every 200ms

    return () => clearInterval(interval);
  }, [selectedAnnotationIds]);

  // isManager now comes from backend API

  if (loading) {
    return <div className="container py-5 text-center text-muted">Loading...</div>;
  }
  if (error) {
    return <div className="container py-5 text-danger">Error: {error}</div>;
  }
  if (!project) {
    return <div className="container py-5">Project not found</div>;
  }

  return (
    <div ref={containerRef} className="d-flex flex-column overflow-hidden" style={{ height: '100%' }}>
      {/* Project Header */}
      <div className="bg-white border-bottom shadow-sm p-3 flex-shrink-0">
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <h1 className="h3 mb-0 me-3">{project.name}</h1>
            {project.description && <p className="text-muted mb-0">{project.description}</p>}
          </div>
          <div className="d-flex align-items-center gap-3">
            <Link
              to={`/projects/${projectId}/hdt`}
              className="btn btn-outline-secondary btn-sm"
              title="Manage HDT metadata and default 3D model"
            >
              <i className="bi bi-sliders me-2"></i>
              Manage HDT
            </Link>
            <button
              onClick={handleDownloadRdf}
              disabled={downloadingRdf}
              className="btn btn-outline-primary btn-sm"
              title="Download Heritage Digital Twin metadata as RDF/Turtle"
            >
              {downloadingRdf ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Generating...
                </>
              ) : (
                <>
                  <i className="bi bi-download me-2"></i>
                  Download RDF
                </>
              )}
            </button>
            <button
              onClick={async () => {
                if (!projectId || !selectedSceneId) return;
                try {
                  const url = `${getApiBase()}/api/projects/${projectId}/scenes/${selectedSceneId}/export`;
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${projectId}-${selectedSceneId}.json`;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => document.body.removeChild(a), 100);
                } catch (err: any) {
                  console.error('Error exporting scene:', err);
                  alert('Failed to export scene JSON: ' + (err.message || 'Unknown error'));
                }
              }}
              className="btn btn-outline-secondary btn-sm"
              title="Export current scene as JSON file (for debugging)"
            >
              <i className="bi bi-file-earmark-code me-2"></i>
              Export Scene JSON
            </button>
            <div className="text-secondary">
              Manager: {project.manager ? project.manager.displayName : <span className="text-warning">Unassigned</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="bg-light border-end" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, position: 'relative' }}>

          {sceneDesc && (
            <>
              <ThreeJSViewer
                ref={viewerRef}
                height="100%"
                sceneDesc={sceneDesc}
                onReady={setupAnnotationCallback}
                onLoadProgress={(progress: LoadingProgress) => {
                  setLoadingModels(true);
                  setModelLoadProgress(prev => ({
                    ...prev,
                    [progress.modelId]: progress.percentage
                  }));
                }}
                onLoadComplete={(modelId: string) => {
                  setModelLoadProgress(prev => {
                    const updated = { ...prev };
                    delete updated[modelId];
                    // Check if all models are done after this deletion
                    if (Object.keys(updated).length === 0) {
                      setLoadingModels(false);
                    }
                    return updated;
                  });
                }}
                onLoadError={(modelId: string, error: Error) => {
                  console.error(`Failed to load model ${modelId}:`, error);
                  setModelLoadProgress(prev => {
                    const updated = { ...prev };
                    delete updated[modelId];
                    return updated;
                  });
                }}
              />
              {/* Loading overlay */}
              {loadingModels && Object.keys(modelLoadProgress).length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontFamily: 'sans-serif',
                  zIndex: 1000,
                  pointerEvents: 'none'
                }}>
                  <div style={{ textAlign: 'center', maxWidth: '400px', width: '90%' }}>
                    <div style={{ fontSize: '18px', marginBottom: '15px', fontWeight: 500 }}>
                      Loading 3D Models...
                    </div>
                    {Object.entries(modelLoadProgress).map(([modelId, percentage]) => (
                      <div key={modelId} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '14px', marginBottom: '6px', opacity: 0.9 }}>
                          {modelId}
                        </div>
                        <div style={{
                          width: '100%',
                          height: '6px',
                          background: 'rgba(255, 255, 255, 0.2)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${percentage}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #4CAF50, #8BC34A)',
                            borderRadius: '3px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                          {Math.round(percentage)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar with Tabs */}
        <div className="bg-white border-start" style={{ width: '350px', minWidth: '300px', flexShrink: 0 }}>
          <div className="h-100 d-flex flex-column">
            {/* Tab Navigation */}
            <ul className="nav nav-tabs px-3 pt-3 flex-shrink-0" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'scene' ? 'active' : ''}`}
                  onClick={() => setActiveTab('scene')}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'scene'}
                >
                  Scenes
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'models' ? 'active' : ''}`}
                  onClick={() => setActiveTab('models')}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'models'}
                >
                  Models
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'annotations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('annotations')}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'annotations'}
                >
                  Annotations
                </button>
              </li>
            </ul>

            {/* Tab Content */}
            <div className="tab-content flex-grow-1 overflow-hidden d-flex flex-column">
              {/* Models Tab */}
              {activeTab === 'models' && (
                <div className="p-3 h-100 d-flex flex-column">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h3 className="h6 mb-0">Models in Scene</h3>
                    <button
                      onClick={cycleModels}
                      className="btn btn-sm btn-outline-secondary"
                      title="Cycle through models (show one at a time)"
                      disabled={!sceneDesc?.models || sceneDesc.models.length === 0}
                    >
                      <i className="bi bi-arrow-repeat"></i>
                    </button>
                  </div>


                  <div className="flex-grow-1 overflow-auto">
                    {files.length === 0 ? (
                      <p className="text-muted fst-italic">No files uploaded yet.</p>
                    ) : (
                      <div className="list-group list-group-flush">
                        {files.map(f => {
                          // Handle diverse response formats (legacy name vs new assetId/entryPointUrl)
                          const entryUrl = (f as any).entryPointUrl || (f as any).fileUrl || f.name || '';
                          const safeAssetId = (f as any).assetId || f.name || 'unknown';

                          // Derive filename from URL if possible
                          let fileName = f.name;
                          if (!fileName && entryUrl) {
                            fileName = entryUrl.split('/').pop() || safeAssetId;
                          }
                          if (!fileName) fileName = safeAssetId;

                          // Determine display name: prefer model.title from scene
                          const fileBase = fileName.replace(/\.[^/.]+$/, '');
                          let displayName = fileBase;

                          // Find corresponding model in sceneDesc
                          const sceneModel = sceneDesc?.models?.find((m: any) => {
                            // Direct match for legacy scenes
                            if (m.file === fileName) return true;
                            // HDT URL matching: check if URL ends with filename
                            if (typeof m.file === 'string' && m.file.includes('/') && m.file.endsWith('/' + fileName)) return true;
                            // Match by ID if possible
                            if (m.id === safeAssetId) return true;
                            return false;
                          });
                          if (sceneModel && sceneModel.title) displayName = sceneModel.title;

                          // Use the actual model ID from the scene for visibility control
                          const modelId = sceneModel?.id || fileBase;
                          const isVisible = meshVisibility[modelId] !== false;
                          const isSelected = selectedModelId === modelId;

                          return (
                            <div key={(f as any).assetId || f.name || Math.random()} className="list-group-item p-0">
                              <div className="d-flex align-items-center p-2">
                                <button
                                  onClick={() => toggleMeshVisibility(modelId)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    padding: '0 8px 0 0',
                                    opacity: isVisible ? 1 : 0.3,
                                    transition: 'opacity 0.2s'
                                  }}
                                  title={isVisible ? 'Hide mesh' : 'Show mesh'}
                                >
                                  <i className={`bi ${isVisible ? 'bi-eye' : 'bi-eye-slash'}`}></i>
                                </button>
                                <button
                                  onClick={() => toggleModelInfo(modelId)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    flex: 1,
                                    padding: 0,
                                    color: 'inherit',
                                    textDecoration: 'none'
                                  }}
                                  className="text-break"
                                >
                                  {displayName}
                                </button>
                                <a
                                  href={f.url}
                                  download
                                  className="btn btn-sm btn-link p-0 ms-2"
                                  title="Download file"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <i className="bi bi-download"></i>
                                </a>
                              </div>

                              {/* Model Details (expandable) */}
                              {isSelected && (
                                <div className="px-2 pb-2 pt-1" style={{ fontSize: '0.85em', color: '#666' }}>
                                  <div className="border-top pt-2">
                                    <div><strong>Filename:</strong> {f.name}</div>
                                    <div><strong>File Size:</strong> {f.size ? formatFileSize(f.size) : 'Unknown'}</div>
                                    {(() => {
                                      const stats = viewerRef.current?.getModelStats(modelId);
                                      if (stats) {
                                        return (
                                          <>
                                            <div><strong>Triangles:</strong> {stats.triangles.toLocaleString()}</div>
                                            <div><strong>Vertices:</strong> {stats.vertices.toLocaleString()}</div>
                                            <div>
                                              <strong>BBox (X,Y,Z):</strong>{' '}
                                              {stats.bbox.x.toFixed(3)}, {stats.bbox.y.toFixed(3)}, {stats.bbox.z.toFixed(3)}
                                            </div>
                                            <div>
                                              <strong>Textures:</strong> {stats.textures.count}
                                              {stats.textures.count > 0 && stats.textures.dimensions.length > 0 && (
                                                <div style={{ marginLeft: '1rem', fontSize: '0.9em' }}>
                                                  {stats.textures.dimensions.map((dim, idx) => (
                                                    <div key={idx}>
                                                      Texture {idx + 1}: {dim.width}×{dim.height}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </>
                                        );
                                      }
                                      return null;
                                    })()}

                                    {/* Transformation Controls - Always Visible */}
                                    <div className="mt-2" style={{ lineHeight: '1.2' }}>
                                      <div className="d-flex align-items-center" style={{ marginBottom: '0.25rem' }}>
                                        <strong style={{ flex: '0 0 auto', width: '70px', fontSize: '0.9em' }}>Position:</strong>
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          placeholder="x, y, z"
                                          value={editingModelId === modelId ? editedPosition : (sceneModel?.position?.join(', ') || '0, 0, 0')}
                                          disabled={editingModelId !== modelId}
                                          onChange={(e) => {
                                            const newValue = e.target.value;
                                            setEditedPosition(newValue);
                                            applyLiveTransform(modelId, newValue, editedRotation, editedScale);
                                          }}
                                          style={{
                                            backgroundColor: editingModelId === modelId ? 'white' : '#f8f9fa',
                                            cursor: editingModelId === modelId ? 'text' : 'not-allowed',
                                            padding: '0.2rem 0.4rem',
                                            fontSize: '0.85em'
                                          }}
                                        />
                                      </div>
                                      <div className="d-flex align-items-center" style={{ marginBottom: '0.25rem' }}>
                                        <strong style={{ flex: '0 0 auto', width: '70px', fontSize: '0.9em' }}>Rotation:</strong>
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          placeholder="x, y, z"
                                          value={editingModelId === modelId ? editedRotation : (sceneModel?.rotation?.join(', ') || '0, 0, 0')}
                                          disabled={editingModelId !== modelId}
                                          onChange={(e) => {
                                            const newValue = e.target.value;
                                            setEditedRotation(newValue);
                                            applyLiveTransform(modelId, editedPosition, newValue, editedScale);
                                          }}
                                          style={{
                                            backgroundColor: editingModelId === modelId ? 'white' : '#f8f9fa',
                                            cursor: editingModelId === modelId ? 'text' : 'not-allowed',
                                            padding: '0.2rem 0.4rem',
                                            fontSize: '0.85em'
                                          }}
                                        />
                                      </div>
                                      <div className="d-flex align-items-center" style={{ marginBottom: '0.4rem' }}>
                                        <strong style={{ flex: '0 0 auto', width: '70px', fontSize: '0.9em' }}>Scale:</strong>
                                        <input
                                          type="text"
                                          className="form-control form-control-sm"
                                          placeholder="1 or x, y, z"
                                          value={editingModelId === modelId
                                            ? editedScale
                                            : (sceneModel?.scale !== undefined
                                              ? (Array.isArray(sceneModel.scale)
                                                ? sceneModel.scale.join(', ')
                                                : String(sceneModel.scale))
                                              : '1')}
                                          disabled={editingModelId !== modelId}
                                          onChange={(e) => {
                                            const newValue = e.target.value;
                                            setEditedScale(newValue);
                                            applyLiveTransform(modelId, editedPosition, editedRotation, newValue);
                                          }}
                                          style={{
                                            backgroundColor: editingModelId === modelId ? 'white' : '#f8f9fa',
                                            cursor: editingModelId === modelId ? 'text' : 'not-allowed',
                                            padding: '0.2rem 0.4rem',
                                            fontSize: '0.85em'
                                          }}
                                        />
                                      </div>

                                      {saveError && editingModelId === modelId && (
                                        <div className="alert alert-danger alert-sm py-1 px-2" style={{ fontSize: '0.85em', marginBottom: '0.4rem' }}>
                                          {saveError}
                                        </div>
                                      )}

                                      {isManager && (
                                        <div className="d-flex gap-2 align-items-center">
                                          {editingModelId === modelId ? (
                                            <>
                                              <button
                                                className="btn btn-sm btn-success"
                                                onClick={() => saveModelProperties(modelId, f.name)}
                                                title="Save changes"
                                                style={{ width: '32px', height: '32px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                              >
                                                <i className="bi bi-check-lg" style={{ fontSize: '1.2em' }}></i>
                                              </button>
                                              <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={cancelEditing}
                                                title="Cancel editing"
                                                style={{ width: '32px', height: '32px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                              >
                                                <i className="bi bi-x-lg" style={{ fontSize: '1.2em' }}></i>
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              className="btn btn-sm btn-outline-primary"
                                              onClick={() => startEditingModel(modelId, sceneModel)}
                                              title="Edit transformation"
                                            >
                                              <i className="bi bi-pencil"></i> Edit
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Scene Tab */}
              {activeTab === 'scene' && (
                <div className="p-3 h-100 d-flex flex-column">
                  {/* Scene Selector */}
                  {availableScenes.length > 0 && (
                    <div className="mb-3">
                      <select
                        id="scene-selector-sidebar"
                        className="form-select"
                        value={selectedSceneId || ''}
                        onChange={(e) => setSelectedSceneId(e.target.value)}
                      >
                        {availableScenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.label} {scene.isDefault ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                      <small className="text-muted">
                        {availableScenes.length} scene{availableScenes.length !== 1 ? 's' : ''} available
                      </small>
                    </div>
                  )}

                  <hr className="my-3" />

                  {/* Scene Settings */}
                  <h6 className="mb-3">Scene Settings</h6>
                  {isManager ? (
                    <div className="flex-grow-1">
                      {/* Ground Grid Setting */}
                      <div className="mb-3">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="showGroundCheckbox"
                            checked={showGround}
                            onChange={async (e) => {
                              const newShowGround = e.target.checked;

                              // Update local state immediately for UI
                              setShowGround(newShowGround);

                              // Update 3D scene directly
                              viewerRef.current?.setGroundVisible(newShowGround);

                              // Ensure HDT document exists before saving
                              if (!await ensureHDTDocument(projectId!)) {
                                console.error('Failed to ensure HDT document exists');
                                return;
                              }

                              // Save to backend
                              const updatedScene = {
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  showGround: newShowGround
                                }
                              } as SceneDescription;

                              try {
                                console.log('💾 Saving ground grid setting to backend:', updatedScene.environment);
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  const errorText = await response.text();
                                  console.error('❌ Backend response:', errorText);
                                  throw new Error('Failed to save scene settings');
                                }

                                // Do NOT update sceneDesc to avoid viewer re-initialization
                                console.log('✅ Ground grid setting saved:', newShowGround);
                              } catch (err: any) {
                                console.error('❌ Failed to save ground setting:', err);
                                alert('Failed to save ground setting: ' + err.message);
                              }
                            }}
                            title="Display a reference grid at the base of the scene"
                          />
                          <label className="form-check-label" htmlFor="showGroundCheckbox" title="Display a reference grid at the base of the scene">
                            Show Ground Grid
                          </label>
                        </div>
                      </div>

                      {/* Background Color Setting */}
                      <div className="mb-3">
                        <div className="d-flex gap-2 align-items-center">
                          <label htmlFor="backgroundColorInput" className="form-label mb-0" style={{ whiteSpace: 'nowrap' }}>
                            Background Color
                          </label>
                          <input
                            type="color"
                            className="form-control form-control-color"
                            id="backgroundColorInput"
                            value={backgroundColor}
                            onChange={async (e) => {
                              const newBackground = e.target.value;

                              // Update local state immediately for UI
                              setBackgroundColor(newBackground);

                              // Update 3D scene directly
                              viewerRef.current?.setBackgroundColor(newBackground);

                              // Ensure HDT document exists before saving
                              if (!await ensureHDTDocument(projectId!)) {
                                console.error('Failed to ensure HDT document exists');
                                return;
                              }

                              // Save to backend
                              const updatedScene = {
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  background: newBackground
                                }
                              } as SceneDescription;

                              try {
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to save scene settings');
                                }

                                // Do NOT update sceneDesc
                                console.log('✅ Background color saved:', newBackground);
                              } catch (err: any) {
                                console.error('❌ Failed to save background color:', err);
                                alert('Failed to save background color: ' + err.message);
                              }
                            }}
                            title="Set the background color of the 3D viewer"
                          />
                          <input
                            type="text"
                            className="form-control"
                            style={{ maxWidth: '100px' }}
                            value={backgroundColor}
                            onChange={async (e) => {
                              const newBackground = e.target.value;
                              // Validate hex color format
                              if (!/^#[0-9A-Fa-f]{6}$/.test(newBackground)) return;

                              // Update local state immediately for UI
                              setBackgroundColor(newBackground);

                              // Update 3D scene directly
                              viewerRef.current?.setBackgroundColor(newBackground);

                              // Ensure HDT document exists before saving
                              if (!await ensureHDTDocument(projectId!)) {
                                console.error('Failed to ensure HDT document exists');
                                return;
                              }

                              // Save to backend
                              const updatedScene = {
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  background: newBackground
                                }
                              } as SceneDescription;

                              try {
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to save scene settings');
                                }

                                // Do NOT update sceneDesc
                                console.log('✅ Background color saved:', newBackground);
                              } catch (err: any) {
                                console.error('❌ Failed to save background color:', err);
                              }
                            }}
                            placeholder="#404040"
                            title="Set the background color of the 3D viewer"
                          />
                        </div>
                      </div>

                      {/* Headlight Offset Setting */}
                      <div className="mb-3">
                        <label className="form-label">
                          Headlight Direction Offset (degrees)
                        </label>
                        <div className="d-flex gap-2 align-items-center">
                          <div className="flex-fill">
                            <label htmlFor="headlightHorizontal" className="form-label small mb-1">
                              Horizontal
                            </label>
                            <input
                              type="number"
                              id="headlightHorizontal"
                              className="form-control"
                              step="1"
                              value={String(headlightOffset[0])}
                              onChange={async (e) => {
                                const newThetaDeg = parseFloat(e.target.value || '0');
                                const phiDeg = headlightOffset[1];
                                const updatedScene = {
                                  ...sceneDesc,
                                  environment: {
                                    ...sceneDesc?.environment,
                                    headLightOffset: [newThetaDeg, phiDeg]
                                  }
                                } as SceneDescription;

                                try {
                                  // Update local state first
                                  setHeadlightOffset([newThetaDeg, phiDeg]);

                                  // Update 3D scene directly
                                  viewerRef.current?.setHeadLightOffset(newThetaDeg, phiDeg);

                                  // Ensure HDT document exists before saving
                                  if (!await ensureHDTDocument(projectId!)) {
                                    console.error('Failed to ensure HDT document exists');
                                    return;
                                  }

                                  // Save to backend
                                  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(updatedScene)
                                  });
                                  if (!response.ok) throw new Error('Failed to save headlight offset');

                                  console.log('✅ Headlight horizontal offset saved:', newThetaDeg);
                                } catch (err: any) {
                                  console.error('❌ Failed to save headlight offset:', err);
                                  alert('Failed to save headlight offset: ' + err.message);
                                }
                              }}
                              placeholder="0"
                            />
                          </div>
                          <div className="flex-fill">
                            <label htmlFor="headlightVertical" className="form-label small mb-1">
                              Vertical
                            </label>
                            <input
                              type="number"
                              id="headlightVertical"
                              className="form-control"
                              step="1"
                              value={String(headlightOffset[1])}
                              onChange={async (e) => {
                                const newPhiDeg = parseFloat(e.target.value || '0');
                                const thetaDeg = headlightOffset[0];
                                const updatedScene = {
                                  ...sceneDesc,
                                  environment: {
                                    ...sceneDesc?.environment,
                                    headLightOffset: [thetaDeg, newPhiDeg]
                                  }
                                } as SceneDescription;

                                try {
                                  // Update local state first
                                  setHeadlightOffset([thetaDeg, newPhiDeg]);

                                  // Update 3D scene directly
                                  viewerRef.current?.setHeadLightOffset(thetaDeg, newPhiDeg);

                                  // Ensure HDT document exists before saving
                                  if (!await ensureHDTDocument(projectId!)) {
                                    console.error('Failed to ensure HDT document exists');
                                    return;
                                  }

                                  // Save to backend
                                  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(updatedScene)
                                  });
                                  if (!response.ok) throw new Error('Failed to save headlight offset');

                                  console.log('✅ Headlight vertical offset saved:', newPhiDeg);
                                } catch (err: any) {
                                  console.error('❌ Failed to save headlight offset:', err);
                                  alert('Failed to save headlight offset: ' + err.message);
                                }
                              }}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <small className="text-muted d-block mt-1">
                          Adjust the headlight direction relative to the camera (0, 0 = aligned with camera)
                        </small>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-grow-1 d-flex align-items-center justify-content-center">
                      <p className="text-muted fst-italic">Only project managers can edit scene settings</p>
                    </div>
                  )}
                </div>
              )}

              {/* Annotations Tab */}
              {activeTab === 'annotations' && (
                <div className="p-3 h-100 d-flex flex-column">
                  <h3 className="h6 mb-3">Annotations</h3>

                  {annotations.length === 0 ? (
                    <div className="flex-grow-1 d-flex align-items-center justify-content-center">
                      <p className="text-muted fst-italic">
                        No annotations yet. Click the pencil button and double-click on the model to add an annotation point.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-grow-1 overflow-auto">
                      <div className="list-group">
                        {annotations.map((annotation) => {
                          const isSelected = selectedAnnotationIds.includes(annotation.id);
                          return (
                            <div
                              key={annotation.id}
                              className={`list-group-item list-group-item-action ${isSelected ? 'active' : ''}`}
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                if (viewerRef.current) {
                                  const annotationMgr = viewerRef.current.getAnnotationManager();
                                  if (e.ctrlKey || e.metaKey) {
                                    // Toggle selection with Ctrl/Cmd
                                    if (isSelected) {
                                      // Remove from selection by selecting all others
                                      const newSelection = selectedAnnotationIds.filter(id => id !== annotation.id);
                                      annotationMgr.clearSelection();
                                      annotationMgr.select(newSelection, false);
                                    } else {
                                      // Add to selection
                                      annotationMgr.select([annotation.id], true);
                                    }
                                  } else {
                                    // Single selection
                                    annotationMgr.select([annotation.id], false);
                                  }
                                }
                              }}
                            >
                              <div className="d-flex w-100 justify-content-between align-items-start">
                                <h5 className="mb-1">{annotation.label}</h5>
                                <span className={`badge ${annotation.type === 'point' ? 'bg-primary' :
                                  annotation.type === 'line' ? 'bg-success' :
                                    'bg-warning'
                                  }`}>
                                  {annotation.type}
                                </span>
                              </div>
                              <p className="mb-1 small text-muted">
                                ID: {annotation.id}
                              </p>
                              {annotation.type === 'point' && Array.isArray(annotation.geometry) && annotation.geometry.length === 3 && (
                                <p className="mb-0 small font-monospace">
                                  [{(annotation.geometry as [number, number, number])[0].toFixed(3)}, {(annotation.geometry as [number, number, number])[1].toFixed(3)}, {(annotation.geometry as [number, number, number])[2].toFixed(3)}]
                                </p>
                              )}
                              {annotation.type !== 'point' && Array.isArray(annotation.geometry) && (
                                <p className="mb-0 small">
                                  {(annotation.geometry as [number, number, number][]).length} points
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
