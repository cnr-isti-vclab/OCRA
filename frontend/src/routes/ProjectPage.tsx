import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState, useRef } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, Link } from 'react-router-dom';
import ThreeDHOPViewer from '../components/ThreeViewer';
import ThreeJSViewer, { type ThreeJSViewerRef } from '../components/ThreeJSViewer';
import { getApiBase } from '../config/oauth';
import type { SceneDescription } from '../components/ThreePresenter';

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

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isManager, setIsManager] = useState<boolean>(false);
  const [files, setFiles] = useState<Array<{ name: string; url: string; size?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sceneDesc, setSceneDesc] = useState<SceneDescription | null>(null);
  const [meshVisibility, setMeshVisibility] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'models' | 'annotations' | 'scene'>('scene');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editedPosition, setEditedPosition] = useState<string>('');
  const [editedRotation, setEditedRotation] = useState<string>('');
  const [editedScale, setEditedScale] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeJSViewerRef>(null);

  // Handle file selection and upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/projects/${projectId}/files`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      // Refresh file list
      const filesRes = await fetch(`${getApiBase()}/api/projects/${projectId}/files`, { credentials: 'include' });
      const filesData = await filesRes.json();
      console.log('📁 Files received after upload:', filesData.files);
      setFiles(filesData.files || []);
      
      // Refresh scene to include the newly uploaded file
      const sceneRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
        credentials: 'include'
      });
      if (sceneRes.ok) {
        const scene = await sceneRes.json();
        // Add projectId to scene if not present
        if (!scene.projectId) {
          scene.projectId = projectId;
        }
        setSceneDesc(scene);
        // Update visibility state for all models
        const updatedVisibility: Record<string, boolean> = {};
        if (scene.models) {
          scene.models.forEach((model: any) => {
            updatedVisibility[model.id] = model.visible !== false;
          });
        }
        setMeshVisibility(updatedVisibility);
      }
      
      // Clear the input
      e.target.value = '';
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Trigger file input click
  const triggerFileSelect = () => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    fileInput?.click();
  };

  // Toggle mesh visibility
  const toggleMeshVisibility = (meshName: string) => {
    const newVisibility = !meshVisibility[meshName];
    setMeshVisibility(prev => ({ ...prev, [meshName]: newVisibility }));
    viewerRef.current?.setMeshVisibility(meshName, newVisibility);
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
      
      // Find or create the model entry
      let modelIndex = updatedScene.models.findIndex((m: any) => m.id === modelId || m.file === fileName);
      if (modelIndex === -1) {
        // Create new model entry
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

      // Save to backend
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
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
        // Fetch scene.json
        const sceneRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
          credentials: 'include'
        });
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          // Add projectId to scene if not present
          if (!scene.projectId) {
            scene.projectId = projectId;
          }
          setSceneDesc(scene);
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
          <div className="text-secondary">
            Manager: {project.manager ? project.manager.displayName : <span className="text-warning">Unassigned</span>}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="bg-light border-end" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          {sceneDesc && (
            <ThreeJSViewer
              ref={viewerRef}
              height="100%"
              sceneDesc={sceneDesc}
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
                  Scene
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
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3 className="h6 mb-0">3D Models</h3>
                    {isManager && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={triggerFileSelect}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading...' : '➕ Add Model'}
                      </button>
                    )}
                  </div>

                  {/* Hidden file input */}
                  <input
                    id="file-input"
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                    accept=".ply,.obj,.stl,.gltf,.glb,.dae,.fbx,.3ds,.x3d,.nxs"
                  />

                  {uploadError && <div className="alert alert-danger small py-2">{uploadError}</div>}

                  <div className="flex-grow-1 overflow-auto">
                    {files.length === 0 ? (
                      <p className="text-muted fst-italic">No files uploaded yet.</p>
                    ) : (
                      <div className="list-group list-group-flush">
                        {files.map(f => {
                          // Determine display name: prefer model.title from scene, otherwise filename without extension
                          const fileBase = f.name.replace(/\.[^/.]+$/, '');
                          let displayName = fileBase;
                          // Find corresponding model in sceneDesc by matching file name
                          const sceneModel = sceneDesc?.models?.find((m: any) => m.file === f.name);
                          if (sceneModel && sceneModel.title) displayName = sceneModel.title;

                          const meshName = fileBase; // legacy key used in visibility map
                          const modelId = sceneModel?.id || fileBase;
                          const isVisible = meshVisibility[meshName] !== false;
                          const isSelected = selectedModelId === modelId;

                          return (
                            <div key={f.name} className="list-group-item p-0">
                              <div className="d-flex align-items-center p-2">
                                <button
                                  onClick={() => toggleMeshVisibility(meshName)}
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
                                    
                                    {editingModelId === modelId ? (
                                      // Edit mode
                                      <>
                                        <div className="mt-2">
                                          <strong>Position:</strong>
                                          <input
                                            type="text"
                                            className="form-control form-control-sm mt-1"
                                            placeholder="x, y, z"
                                            value={editedPosition}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedPosition(newValue);
                                              applyLiveTransform(modelId, newValue, editedRotation, editedScale);
                                            }}
                                          />
                                        </div>
                                        <div className="mt-2">
                                          <strong>Rotation:</strong>
                                          <input
                                            type="text"
                                            className="form-control form-control-sm mt-1"
                                            placeholder="x, y, z"
                                            value={editedRotation}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedRotation(newValue);
                                              applyLiveTransform(modelId, editedPosition, newValue, editedScale);
                                            }}
                                          />
                                        </div>
                                        <div className="mt-2">
                                          <strong>Scale:</strong>
                                          <input
                                            type="text"
                                            className="form-control form-control-sm mt-1"
                                            placeholder="1 or x, y, z"
                                            value={editedScale}
                                            onChange={(e) => {
                                              const newValue = e.target.value;
                                              setEditedScale(newValue);
                                              applyLiveTransform(modelId, editedPosition, editedRotation, newValue);
                                            }}
                                          />
                                        </div>
                                        {saveError && (
                                          <div className="alert alert-danger alert-sm mt-2 py-1 px-2" style={{ fontSize: '0.85em' }}>
                                            {saveError}
                                          </div>
                                        )}
                                        <div className="mt-2 d-flex gap-2">
                                          <button
                                            className="btn btn-success btn-sm"
                                            onClick={() => saveModelProperties(modelId, f.name)}
                                          >
                                            Save
                                          </button>
                                          <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={cancelEditing}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </>
                                    ) : (
                                      // View mode
                                      <>
                                        <div style={{ color: sceneModel?.position ? '#666' : '#ccc' }}>
                                          <strong>Position:</strong> {
                                            sceneModel?.position 
                                              ? `[${sceneModel.position.join(', ')}]`
                                              : '[not set]'
                                          }
                                        </div>
                                        <div style={{ color: sceneModel?.rotation ? '#666' : '#ccc' }}>
                                          <strong>Rotation:</strong> {
                                            sceneModel?.rotation
                                              ? `[${sceneModel.rotation.join(', ')}]°`
                                              : '[not set]'
                                          }
                                        </div>
                                        <div style={{ color: sceneModel?.scale !== undefined ? '#666' : '#ccc' }}>
                                          <strong>Scale:</strong> {
                                            sceneModel?.scale !== undefined
                                              ? (Array.isArray(sceneModel.scale)
                                                  ? `[${sceneModel.scale.join(', ')}]`
                                                  : sceneModel.scale)
                                              : '[not set]'
                                          }
                                        </div>
                                        {isManager && (
                                          <button
                                            className="btn btn-sm btn-outline-primary mt-2"
                                            onClick={() => startEditingModel(modelId, sceneModel)}
                                          >
                                            <i className="bi bi-pencil"></i> Edit
                                          </button>
                                        )}
                                      </>
                                    )}
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
                  <h3 className="h6 mb-3">Scene Settings</h3>
                  {isManager ? (
                    <div className="flex-grow-1">
                      {/* Ground Grid Setting */}
                      <div className="mb-3">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="showGroundCheckbox"
                            checked={sceneDesc?.environment?.showGround ?? false}
                            onChange={async (e) => {
                              const showGround = e.target.checked;
                              const updatedScene = { 
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  showGround
                                }
                              } as SceneDescription;
                              
                              try {
                                // Save to backend
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to save scene settings');
                                }

                                // Update local state
                                setSceneDesc(updatedScene);
                                console.log('✅ Ground grid setting saved:', showGround);
                              } catch (err: any) {
                                console.error('❌ Failed to save ground setting:', err);
                                alert('Failed to save ground setting: ' + err.message);
                              }
                            }}
                          />
                          <label className="form-check-label" htmlFor="showGroundCheckbox">
                            Show Ground Grid
                          </label>
                        </div>
                        <small className="text-muted d-block mt-1">
                          Display a reference grid at the base of the scene
                        </small>
                      </div>

                      {/* Background Color Setting */}
                      <div className="mb-3">
                        <label htmlFor="backgroundColorInput" className="form-label">
                          Background Color
                        </label>
                        <div className="d-flex gap-2 align-items-center">
                          <input
                            type="color"
                            className="form-control form-control-color"
                            id="backgroundColorInput"
                            value={sceneDesc?.environment?.background || '#404040'}
                            onChange={async (e) => {
                              const background = e.target.value;
                              const updatedScene = { 
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  background
                                }
                              } as SceneDescription;
                              
                              try {
                                // Save to backend
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to save scene settings');
                                }

                                // Update local state
                                setSceneDesc(updatedScene);
                                console.log('✅ Background color saved:', background);
                              } catch (err: any) {
                                console.error('❌ Failed to save background color:', err);
                                alert('Failed to save background color: ' + err.message);
                              }
                            }}
                            title="Choose background color"
                          />
                          <input
                            type="text"
                            className="form-control"
                            style={{ maxWidth: '100px' }}
                            value={sceneDesc?.environment?.background || '#404040'}
                            onChange={async (e) => {
                              const background = e.target.value;
                              // Validate hex color format
                              if (!/^#[0-9A-Fa-f]{6}$/.test(background)) return;
                              
                              const updatedScene = { 
                                ...sceneDesc,
                                environment: {
                                  ...sceneDesc?.environment,
                                  background
                                }
                              } as SceneDescription;
                              
                              try {
                                // Save to backend
                                const response = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
                                  method: 'PUT',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(updatedScene)
                                });

                                if (!response.ok) {
                                  throw new Error('Failed to save scene settings');
                                }

                                // Update local state
                                setSceneDesc(updatedScene);
                                console.log('✅ Background color saved:', background);
                              } catch (err: any) {
                                console.error('❌ Failed to save background color:', err);
                              }
                            }}
                            placeholder="#404040"
                          />
                        </div>
                        <small className="text-muted d-block mt-1">
                          Set the background color of the 3D viewer
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
                  <div className="flex-grow-1 d-flex align-items-center justify-content-center">
                    <p className="text-muted fst-italic">Annotations feature coming soon...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
