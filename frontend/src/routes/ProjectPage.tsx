import 'bootstrap/dist/css/bootstrap.min.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../adapters/three-presenter/ThreeJSViewer';
import { LoadingProgress } from 'three-presenter';
import { OpenLIMEViewerRef } from '../adapters/openlime-viewer/OpenLIMEViewer.tsx';
import { getApiBase } from '../config/oauth';
import { DigitalAsset } from './HDTPage.tsx';
import Viewer3DPanel from './components/Viewer3DPanel';
import Viewer2DPanel from './components/Viewer2DPanel';
import { AnnotationStoreProvider } from '../context/AnnotationStoreContext';
import AnnotationStoreTestPanel from './components/AnnotationStoreTestPanel';
import { useProjectStructuringAwareness } from '../hooks/useProjectStructuringAwareness';
import { useProjectStructuringLock } from '../context/ProjectStructuringLockContext';
import AnnotationPanel from './components/AnnotationPanel';
import AnnotationViewerPanel from '../features/annotation-viewer/AnnotationViewerPanel';
import {
  resolveAnnotationMode,
  selectionPolicyForAnnotationMode,
  type AnnotationMode,
} from '../features/annotation-modes/resolveAnnotationMode';
import type { SceneDescription } from 'shared/scene-types';
import type { RoleEnum } from 'shared/types';
import { formatZodIssues, sceneAssetReferenceUpdateSchema } from 'shared/scene-schema';

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

interface ProjectMember {
  userId: string;
  role: RoleEnum;
}

// Minimal type to read the 3D model defined in HDT metadata
interface HDTModelMeta {
  fileName: string;
  fileUrl?: string;
}

type SceneModelTransform = Pick<NonNullable<SceneDescription['models']>[number], 'position' | 'rotation' | 'scale'>;
type SceneModelTransformMap = Record<string, SceneModelTransform>;

function cloneVector3(value?: [number, number, number]): [number, number, number] | undefined {
  return value ? [value[0], value[1], value[2]] : undefined;
}

function cloneScale(value?: number | [number, number, number]): number | [number, number, number] | undefined {
  if (typeof value === 'number' || value === undefined) {
    return value;
  }
  return [value[0], value[1], value[2]];
}

function extractModelTransform(model: NonNullable<SceneDescription['models']>[number]): SceneModelTransform {
  return {
    position: cloneVector3(model.position),
    rotation: cloneVector3(model.rotation),
    scale: cloneScale(model.scale),
  };
}

function buildSceneModelTransformMap(scene: SceneDescription | null): SceneModelTransformMap {
  if (!scene?.models) {
    return {};
  }

  return scene.models.reduce<SceneModelTransformMap>((acc, model) => {
    acc[model.id] = extractModelTransform(model);
    return acc;
  }, {});
}

function mergeSceneModelTransforms(
  scene: SceneDescription | null,
  transforms: SceneModelTransformMap,
): SceneDescription | null {
  if (!scene) {
    return null;
  }

  return {
    ...scene,
    models: (scene.models || []).map((model) => {
      const transform = transforms[model.id];
      if (!transform) {
        return model;
      }

      return {
        ...model,
        position: transform.position ?? model.position,
        rotation: transform.rotation ?? model.rotation,
        scale: transform.scale ?? model.scale,
      };
    }),
  };
}

function formatVector3Input(value?: [number, number, number], fallback: string = '0, 0, 0'): string {
  return value ? value.join(', ') : fallback;
}

function formatScaleInput(value?: number | [number, number, number], fallback: string = '1'): string {
  if (value === undefined) {
    return fallback;
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function parseOptionalVector3Input(value: string, label: string): [number, number, number] | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed.split(',').map((part) => parseFloat(part.trim()));
  if (parts.length !== 3) {
    throw new Error(`${label} must have exactly 3 values.`);
  }
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`${label} contains an invalid number.`);
  }

  return [parts[0], parts[1], parts[2]];
}

function parseOptionalScaleInput(value: string): number | [number, number, number] | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.includes(',')) {
    return parseOptionalVector3Input(trimmed, 'Scale');
  }

  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error('Scale contains an invalid number.');
  }

  return parsed;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || '3d';
  const annotationTestMode = mode === 'test';

  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isManager, setIsManager] = useState<boolean>(false);
  const [projectRole, setProjectRole] = useState<RoleEnum | null>(null);
  const [files, setFiles] = useState<Array<{ name: string; url: string; size?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sceneDesc, setSceneDesc] = useState<SceneDescription | null>(null);
  const [sceneModelTransforms, setSceneModelTransforms] = useState<SceneModelTransformMap>({});
  const [availableScenes, setAvailableScenes] = useState<Array<{ id: string; label: string; isDefault?: boolean }>>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [meshVisibility, setMeshVisibility] = useState<Record<string, boolean>>({});
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
  const [hdtModel, setHdtModel] = useState<HDTModelMeta | null>(null);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [modelLoadProgress, setModelLoadProgress] = useState<Record<string, number>>({});

  // 2D viewer (RTI) state
  // const [rtiAsset, setRtiAsset] = useState<{ infoJsonUrl?: string; entryPoint?: string } | null>(null);
  const [rtiAvailable, setRtiAvailable] = useState(false);

  const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeJSViewerRef>(null);
  const openLimeRef = useRef<OpenLIMEViewerRef>(null);
  const sceneLoadSequenceRef = useRef(0);
  const {
    activeDrainingEvent,
    clearDrainingEvent,
    presenceError,
  } = useProjectStructuringAwareness({
    projectId,
    mode: 'viewing',
    sceneId: selectedSceneId,
    enabled: !!projectId,
  });
  const { getProjectLockState } = useProjectStructuringLock();
  const projectLockState = getProjectLockState(projectId);
  const hasExclusiveLock = projectLockState.hasExclusiveLock;
  const isSystemAdministrator = !!user?.sys_admin;
  const annotationMode: AnnotationMode = useMemo(
    () =>
      resolveAnnotationMode({
        projectRole,
        isSystemAdministrator,
      }),
    [projectRole, isSystemAdministrator],
  );
  const canEditProjectSceneData = (isManager || isSystemAdministrator) && hasExclusiveLock;
  const canEditSceneSettings = canEditProjectSceneData;
  const showsSceneEnvironmentSettings = mode === '3d';
  const projectLockBadgeClass = hasExclusiveLock ? 'bg-success' : 'bg-secondary';
  const projectLockBadgeLabel = hasExclusiveLock ? 'Structuring Lock: Active' : 'Structuring Lock: Inactive';
  const [drainingCountdownSeconds, setDrainingCountdownSeconds] = useState<number | null>(null);
  // TODO: when 2D/3D viewers expose transform getters/setters, route this state through them
  // so the sidebar can read live viewer transforms instead of relying only on current-scene data.
  const viewerSceneDesc = useMemo(
    () => mergeSceneModelTransforms(sceneDesc, sceneModelTransforms),
    [sceneDesc, sceneModelTransforms],
  );
  const currentSceneModels = viewerSceneDesc?.models ?? [];

  const applyLoadedScene = useCallback((scene: SceneDescription | null) => {
    setSceneDesc(scene);
    setSceneModelTransforms(buildSceneModelTransformMap(scene));
    setEditingModelId(null);
    setSaveError(null);
    setEditedPosition('');
    setEditedRotation('');
    setEditedScale('');
  }, []);

  useEffect(() => {
    if (!activeDrainingEvent?.drainDeadlineAt) {
      setDrainingCountdownSeconds(null);
      return;
    }

    const deadlineMs = Date.parse(activeDrainingEvent.drainDeadlineAt);
    if (Number.isNaN(deadlineMs)) {
      setDrainingCountdownSeconds(null);
      return;
    }

    let redirectTriggered = false;
    const updateCountdown = () => {
      const remainingMs = deadlineMs - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setDrainingCountdownSeconds(remainingSeconds);

      if (remainingMs <= 0 && !redirectTriggered) {
        redirectTriggered = true;
        navigate('/projects', { replace: true });
      }
    };

    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 250);

    return () => {
      window.clearInterval(timerId);
    };
  }, [activeDrainingEvent, navigate]);

  const loadSelectedScene = useCallback(async () => {
    if (!projectId || !selectedSceneId) return;
    const requestId = ++sceneLoadSequenceRef.current;

    // Clear the current scene immediately so scene-scoped viewers/stores do not
    // re-mount with stale scene content while the next scene payload is loading.
    applyLoadedScene(null);
    setMeshVisibility({});

    try {
      const sceneRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scenes/${selectedSceneId}`, {
        credentials: 'include'
      });

      if (sceneRes.ok) {
        const scene = await sceneRes.json();
        if (sceneLoadSequenceRef.current !== requestId) {
          return;
        }
        console.log('📥 Scene loaded from backend:', scene.environment);
        if (!scene.projectId) {
          scene.projectId = projectId;
        }
        applyLoadedScene(scene);

        setShowGround(scene.environment?.showGround ?? false);
        setBackgroundColor(scene.environment?.background || '#404040');
        setHeadlightOffset(scene.environment?.headLightOffset || [0, 0]);

        const initialVisibility: Record<string, boolean> = {};
        if (scene.models) {
          scene.models.forEach((model: any) => {
            initialVisibility[model.id] = model.visible !== false;
          });
        }
        setMeshVisibility(initialVisibility);
      } else if (sceneLoadSequenceRef.current === requestId) {
        applyLoadedScene(null);
      }
    } catch (err) {
      if (sceneLoadSequenceRef.current === requestId) {
        console.error('Failed to load selected scene:', err);
      }
    }
  }, [applyLoadedScene, projectId, selectedSceneId]);

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
            physicalObjectMetadata: {
              sourceUri: `urn:ocra:project:${projectId}`,
              sourceType: 'other',
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

  const handleExportSceneJson = async () => {
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
  };

  // Toggle mesh visibility
  const toggleMeshVisibility = (meshName: string) => {
    const newVisibility = !meshVisibility[meshName];
    setMeshVisibility(prev => ({ ...prev, [meshName]: newVisibility }));
    viewerRef.current?.setMeshVisibility(meshName, newVisibility);
  };

  // Cycle through models, showing one at a time
  const cycleModels = () => {
    if (!viewerSceneDesc?.models || viewerSceneDesc.models.length === 0) return;

    const modelIds = viewerSceneDesc.models.map((m: any) => m.id);

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
    const modelTransform = sceneModelTransforms[modelId] ?? (sceneModel ? extractModelTransform(sceneModel) : {});
    setEditingModelId(modelId);
    setSaveError(null);
    setEditedPosition(formatVector3Input(modelTransform.position));
    setEditedRotation(formatVector3Input(modelTransform.rotation));
    setEditedScale(formatScaleInput(modelTransform.scale));
  };

  const ensureEditingModel = (modelId: string, sceneModel: any) => {
    if (!canEditProjectSceneData || editingModelId === modelId) {
      return;
    }
    startEditingModel(modelId, sceneModel);
  };

  // Cancel editing
  const cancelEditing = () => {
    // Restore original transformation from scene
    if (editingModelId && viewerSceneDesc) {
      const sceneModel = viewerSceneDesc.models?.find((m: any) => m.id === editingModelId);
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
      const position = parseOptionalVector3Input(posStr, 'Position') ?? null;

      // Parse rotation and convert degrees to radians for Three.js
      const rotationDeg = parseOptionalVector3Input(rotStr, 'Rotation');
      const rotation = rotationDeg ? [
        rotationDeg[0] * Math.PI / 180,
        rotationDeg[1] * Math.PI / 180,
        rotationDeg[2] * Math.PI / 180
      ] as [number, number, number] : null;

      const scale = parseOptionalScaleInput(scaleStr) ?? null;

      viewerRef.current.applyModelTransform(modelId, position, rotation, scale);
    } catch (err) {
      // Silently ignore parse errors during live editing
      console.debug('Parse error during live transform:', err);
    }
  };

  // Save edited model properties
  const saveModelProperties = async (modelId: string, _fileName: string) => {
    setSaveError(null);
    try {
      const position = parseOptionalVector3Input(editedPosition, 'Position');
      const rotation = parseOptionalVector3Input(editedRotation, 'Rotation');
      const scale = parseOptionalScaleInput(editedScale);

      // Ensure HDT document exists before saving
      if (!await ensureHDTDocument(projectId!)) {
        throw new Error('Failed to ensure HDT document exists');
      }

      // Build asset update payload (rotation stored in degrees; backend's generateSceneFile
      // returns rotationUnits: 'deg' so three-presenter converts correctly on reload)
      const assetUpdate: Record<string, unknown> = {};
      if (position) assetUpdate.position = position;
      if (rotation) assetUpdate.rotation = rotation;
      if (scale !== undefined) assetUpdate.scale = scale;

      const assetUpdateResult = sceneAssetReferenceUpdateSchema.safeParse(assetUpdate);
      if (!assetUpdateResult.success) {
        throw new Error(formatZodIssues(assetUpdateResult.error).join(' '));
      }

      // Save to the asset-specific endpoint so the update lands in scene.assets[]
      // (the canonical storage read by generateSceneFile), not as an alien field.
      const response = await fetch(
        `${getApiBase()}/api/projects/${projectId}/hdt/scenes/${selectedSceneId}/assets/${modelId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assetUpdateResult.data)
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const details = Array.isArray(err.details) ? err.details.join(' ') : null;
        throw new Error(details || err.error || 'Failed to save changes');
      }

      // Keep the current scene transforms in sync locally.
      setSceneModelTransforms((prev) => ({
        ...prev,
        [modelId]: {
          position,
          rotation,
          scale,
        },
      }));

      // Exit edit mode
      setEditingModelId(null);
      setEditedPosition('');
      setEditedRotation('');
      setEditedScale('');

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

        if (userData?.id) {
          const membersRes = await fetch(`${getApiBase()}/api/projects/${projectId}/members`, {
            credentials: 'include',
          });
          if (membersRes.ok) {
            const membersJson = await membersRes.json();
            const currentMember = (membersJson.members as ProjectMember[] | undefined)?.find(
              (member) => member.userId === userData.id,
            );
            setProjectRole(currentMember?.role ?? null);
          } else {
            setProjectRole(null);
          }
        } else {
          setProjectRole(null);
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
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          // Add projectId to scene if not present
          if (!scene.projectId) {
            scene.projectId = projectId;
          }
          applyLoadedScene(scene);
          // Initialize visibility state for all models (all visible by default)
          const initialVisibility: Record<string, boolean> = {};
          if (scene.models) {
            scene.models.forEach((model: any) => {
              initialVisibility[model.id] = model.visible !== false;
            });
          }
          setMeshVisibility(initialVisibility);
        } else {
          applyLoadedScene(null);
        }

        // Fetch HDT metadata (read-only): keep a reference for UI, do NOT inject models into the scene.
        // The scene models must come only from /api/projects/:projectId/scenes/:sceneId (MongoDB source of truth).
        try {
          const hdtRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
            credentials: 'include',
          });

          if (hdtRes.ok) {
            const doc: any = await hdtRes.json();

            const assets: any[] = Array.isArray(doc?.digitalAssets) ? doc.digitalAssets : [];
            // Keep a reference to all digital assets for UI purposes (e.g. RTI viewer), but do NOT mutate the scene with HDT metadata.
            setDigitalAssets(assets);

            // Handle 3D assets
            if (mode === '3d') {
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

            // Handle 2D RTI assets
            if (mode === '2d') {
              const rtiAsset = assets.find((a: any) => a?.type === 'rti');
              const rtiAvailable = rtiAsset !== undefined; //!!rtiAsset?.entryPoint;
              setRtiAvailable(rtiAvailable);
              if (rtiAvailable) {
                console.log('📸 RTI asset found');
              } else {
                console.log('📸 No RTI asset found in HDT metadata');
              }
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
  }, [applyLoadedScene, projectId, mode]);

  // Reload scene when selected scene changes
  useEffect(() => {
    loadSelectedScene();
  }, [loadSelectedScene]);

  // Show/hide annotation button based on active tab
  useEffect(() => {
    if (annotationTestMode) {
      return;
    }
    if (viewerRef.current) {
      viewerRef.current.setAnnotationButtonVisible(false);
    }
  }, [activeTab, annotationTestMode]);

  useEffect(() => {
    if (annotationTestMode && activeTab === 'annotations') {
      setActiveTab('scene');
    }
  }, [annotationTestMode, activeTab]);

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

  const projectPageBody = (
      <div ref={containerRef} className="d-flex flex-column overflow-hidden" style={{ height: '100%' }}>
        {/* Project Header */}
        <div className="bg-white border-bottom shadow-sm p-3 flex-shrink-0">
          {(activeDrainingEvent || presenceError) && (
            <div className="alert alert-warning d-flex justify-content-between align-items-start gap-3 mb-3">
              <div>
                <strong>Structuring...</strong>{' '}
                {activeDrainingEvent
                    ? 'Another session is preparing a project-wide structuring operation. Editing and remote saves are temporarily blocked until draining completes. You can leave this project and continue working in other projects.'
                  : presenceError}
                {activeDrainingEvent?.username && (
                  <div className="small mt-2 text-muted">
                    Requested by: {activeDrainingEvent.username}
                  </div>
                )}
                {activeDrainingEvent?.drainDeadlineAt && drainingCountdownSeconds !== null && (
                  <div className="small mt-2 fw-semibold text-dark">
                    Automatic exit in {drainingCountdownSeconds} second{drainingCountdownSeconds === 1 ? '' : 's'}.
                  </div>
                )}
                {activeDrainingEvent?.operationType && (
                  <div className="small mt-2 text-muted">
                    Operation: {activeDrainingEvent.operationType}
                  </div>
                )}
              </div>
              <div className="d-flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => clearDrainingEvent()}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={() => navigate('/projects')}
                >
                    Leave This Project
                </button>
              </div>
            </div>
          )}
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <h1 className="h3 mb-0 me-1">{project.name}</h1>
                  <span className={`badge ${projectLockBadgeClass}`}>{projectLockBadgeLabel}</span>
                  {annotationTestMode && (
                    <span className="badge bg-primary">Annotation Store Lab</span>
                  )}
                </div>
                {project.description && <p className="text-muted mb-0">{project.description}</p>}
              </div>
            </div>
            <div className="d-flex align-items-center gap-3">
              {/* Header actions intentionally minimized to reduce duplication with top navigation */}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-grow-1 d-flex overflow-hidden">
          {/* 3D/2D Viewer */}
          <div
            className="bg-light border-end h-100 overflow-hidden"
            style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, position: 'relative' }}
          >
            {annotationTestMode && (
              selectedSceneId
                ? <AnnotationStoreTestPanel />
                : (
                  <div className="h-100 d-flex align-items-center justify-content-center text-muted p-4">
                    Select a scene in the sidebar to start the annotation store lab.
                  </div>
                )
            )}

            {!annotationTestMode && mode === '3d' && (
              <Viewer3DPanel
                ref={viewerRef}
                sceneDesc={viewerSceneDesc}
                loadingModels={loadingModels}
                modelLoadProgress={modelLoadProgress}
                annotationToolsVisible={activeTab === 'annotations' && annotationMode === 'edit'}
                onReady={() => {
                  console.log('✅ 3D viewer ready');
                }}
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
            )}

            {!annotationTestMode && mode === '2d' && (
              <Viewer2DPanel
                key={`viewer-2d-${selectedSceneId ?? 'none'}`}
                ref={openLimeRef}
                sceneDesc={viewerSceneDesc}
                digitalAssets={digitalAssets}
                rtiAvailable={rtiAvailable}
                annotationMode={annotationMode}
                onReady={() => {
                  console.log('📸 2D RTI viewer ready');
                }}
                onError={(err) => {
                  console.error('📸 2D RTI viewer error:', err);
                  setError(`Failed to load RTI viewer from scene: ${err.message}, ${sceneDesc}`);
                }}
              />
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
                {!annotationTestMode && (
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
                )}
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
                        disabled={!viewerSceneDesc?.models || viewerSceneDesc.models.length === 0}
                      >
                        <i className="bi bi-arrow-repeat"></i>
                      </button>
                    </div>


                    <div className="flex-grow-1 overflow-auto">
                      {currentSceneModels.length === 0 ? (
                        <p className="text-muted fst-italic">No models in the current scene.</p>
                      ) : (
                        <div className="list-group list-group-flush">
                          {currentSceneModels.map((sceneModel) => {
                            const modelId = sceneModel.id;
                            const matchingAsset = digitalAssets.find((asset) => asset.id === modelId);
                            const matchingFile = files.find((file) => {
                              if ((file as any).assetId === modelId) {
                                return true;
                              }
                              if (typeof sceneModel.file === 'string' && file.url === sceneModel.file) {
                                return true;
                              }
                              if (typeof sceneModel.file === 'string' && file.name === sceneModel.file) {
                                return true;
                              }
                              return typeof sceneModel.file === 'string' && sceneModel.file.endsWith(`/${file.name}`);
                            });

                            const fileName =
                              matchingAsset?.entryPoint ||
                              matchingFile?.name ||
                              sceneModel.file.split('/').pop() ||
                              modelId;
                            const fileBase = fileName.replace(/\.[^/.]+$/, '');
                            const displayName = sceneModel.title || matchingAsset?.title || matchingAsset?.label || fileBase;
                            const downloadUrl = matchingFile?.url || matchingAsset?.entryPointUrl || sceneModel.file;
                            const fileSize = matchingFile?.size || matchingAsset?.entrySize;
                            const isVisible = meshVisibility[modelId] !== false;
                            const isSelected = selectedModelId === modelId;

                            return (
                              <div key={modelId} className="list-group-item p-0">
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
                                  {downloadUrl && (
                                    <a
                                      href={downloadUrl}
                                      download
                                      className="btn btn-sm btn-link p-0 ms-2"
                                      title="Download file"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <i className="bi bi-download"></i>
                                    </a>
                                  )}
                                </div>

                                {/* Model Details (expandable) */}
                                {isSelected && (
                                  <div className="px-2 pb-2 pt-1" style={{ fontSize: '0.85em', color: '#666' }}>
                                    <div className="border-top pt-2">
                                      <div><strong>Filename:</strong> {fileName}</div>
                                      <div><strong>File Size:</strong> {fileSize ? formatFileSize(fileSize) : 'Unknown'}</div>
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
                                            value={editingModelId === modelId ? editedPosition : formatVector3Input(sceneModel?.position)}
                                            disabled={!canEditProjectSceneData}
                                            onFocus={() => ensureEditingModel(modelId, sceneModel)}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedPosition(newValue);
                                              applyLiveTransform(modelId, newValue, editedRotation, editedScale);
                                            }}
                                            style={{
                                              backgroundColor: canEditProjectSceneData ? 'white' : '#f8f9fa',
                                              cursor: canEditProjectSceneData ? 'text' : 'not-allowed',
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
                                            value={editingModelId === modelId ? editedRotation : formatVector3Input(sceneModel?.rotation)}
                                            disabled={!canEditProjectSceneData}
                                            onFocus={() => ensureEditingModel(modelId, sceneModel)}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedRotation(newValue);
                                              applyLiveTransform(modelId, editedPosition, newValue, editedScale);
                                            }}
                                            style={{
                                              backgroundColor: canEditProjectSceneData ? 'white' : '#f8f9fa',
                                              cursor: canEditProjectSceneData ? 'text' : 'not-allowed',
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
                                              : formatScaleInput(sceneModel?.scale)}
                                            disabled={!canEditProjectSceneData}
                                            onFocus={() => ensureEditingModel(modelId, sceneModel)}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedScale(newValue);
                                              applyLiveTransform(modelId, editedPosition, editedRotation, newValue);
                                            }}
                                            style={{
                                              backgroundColor: canEditProjectSceneData ? 'white' : '#f8f9fa',
                                              cursor: canEditProjectSceneData ? 'text' : 'not-allowed',
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

                                        {(isManager || isSystemAdministrator) && (
                                          <div className="d-flex gap-2 align-items-center">
                                            {editingModelId === modelId ? (
                                              <>
                                                <button
                                                  className="btn btn-sm btn-success"
                                                  onClick={() => saveModelProperties(modelId, fileName)}
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
                                                title={canEditProjectSceneData ? 'Edit transformation' : 'Acquire the project lock to edit'}
                                                disabled={!canEditProjectSceneData}
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

                    {showsSceneEnvironmentSettings && (
                      <>
                        <hr className="my-3" />

                        {/* Scene Settings */}
                        <h6 className="mb-3">Scene Settings</h6>
                        {isManager ? (
                          <div className="flex-grow-1">
                            {!hasExclusiveLock && (
                              <div className="alert alert-light py-2 px-3 small mb-3">
                                Acquire the project lock from the top bar to edit scene settings.
                              </div>
                            )}
                            {/* Ground Grid Setting */}
                            <div className="mb-3">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id="showGroundCheckbox"
                                  checked={showGround}
                                  disabled={!canEditSceneSettings}
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
                                  disabled={!canEditSceneSettings}
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
                                  disabled={!canEditSceneSettings}
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
                                    disabled={!canEditSceneSettings}
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
                                    disabled={!canEditSceneSettings}
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
                            <p className="text-muted fst-italic">Only project managers and system administrators can edit scene settings</p>
                          </div>
                        )}
                      </>
                    )}

                    <div className="mt-auto pt-3 border-top">
                      <button
                        onClick={handleExportSceneJson}
                        className="btn btn-outline-secondary btn-sm w-100"
                        title="Export current scene as JSON file (for debugging)"
                      >
                        <i className="bi bi-file-earmark-code me-2"></i>
                        Export Scene JSON
                      </button>
                    </div>
                  </div>
                )}

                {/* Annotations Tab */}
                {!annotationTestMode && activeTab === 'annotations' && (
                  <div className="h-100 overflow-auto">
                    {annotationMode === 'viewer' ? <AnnotationViewerPanel /> : <AnnotationPanel />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );

  if (projectId && selectedSceneId && (annotationTestMode || mode === '3d' || mode === '2d')) {
    return (
      <AnnotationStoreProvider
        key={`annotation-scene-${selectedSceneId}`}
        projectId={projectId}
        sceneId={selectedSceneId}
        selectionPolicy={selectionPolicyForAnnotationMode(annotationMode)}
      >
        {projectPageBody}
      </AnnotationStoreProvider>
    );
  }

  return projectPageBody;
}
