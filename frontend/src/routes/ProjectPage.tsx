import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState, useRef } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, Link } from 'react-router-dom';
import ThreeDHOPViewer from '../components/ThreeViewer';
import ThreeJSViewer from '../components/ThreeJSViewer';
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
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sceneDesc, setSceneDesc] = useState<SceneDescription | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setFiles(filesData.files || []);
      
      // Refresh scene to include the newly uploaded file
      const sceneRes = await fetch(`${getApiBase()}/api/projects/${projectId}/scene`, {
        credentials: 'include'
      });
      if (sceneRes.ok) {
        const scene = await sceneRes.json();
        setSceneDesc(scene);
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
          setSceneDesc(scene);
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
              height="100%"
              sceneDesc={sceneDesc}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="bg-white border-start" style={{ width: '350px', minWidth: '300px', flexShrink: 0 }}>
          <div className="p-3 h-100 d-flex flex-column">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="h6 mb-0">Project Files</h3>
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
                <table className="table table-sm">
                  <tbody>
                    {files.map(f => (
                      <tr key={f.name}>
                        <td>👁️</td>
                        <td><a href={f.url} target="_blank" rel="noopener noreferrer" className="text-break">{f.name}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
