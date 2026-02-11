import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiBase } from '../config/oauth';

/**
 * PROJECTS COMPONENT
 * 
 * This component displays the list of projects in the system.
 * It fetches project data from the backend API and presents it
 * in a user-friendly format.
 * 
 * Features:
 * - Shows all projects with their details
 * - Loading states and error handling
 * - Responsive card-based layout
 * - Project creation/editing (future enhancement)
 */

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


interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
  displayName: string;
  sys_admin: boolean;
  sys_creator?: boolean;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Map of projectId to isManager boolean
  const [managerMap, setManagerMap] = useState<Record<string, boolean>>({});
  // Map of projectId to has3DAssets boolean
  const [has3DAssetsMap, setHas3DAssetsMap] = useState<Record<string, boolean>>({});
  const [has2DAssetsMap, setHas2DAssetsMap] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        
        if (!sessionId) {
          throw new Error('No session found');
        }

        // Fetch current user information
        const userResponse = await fetch(`${getApiBase()}/api/sessions/current`, {
          credentials: 'include', // Include session cookies
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData.user);
        }

        // Fetch projects
        const response = await fetch(`${getApiBase()}/api/projects`, {
          credentials: 'include', // Include session cookies
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }

        const data = await response.json();
        setProjects(data.projects || data || []);
      } catch (e: any) {
        console.error('Failed to fetch data:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Create a new project and open the edit page
  const createNewProject = async () => {
    try {
      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({
          name: `New Project ${new Date().toISOString()}`,
          description: 'Draft project created from UI',
          public: false
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create project: ${response.status} - ${err}`);
      }

      const data = await response.json();
      const created = data.project || data;
      if (created && created.id) {
        navigate(`/projects/${created.id}/edit`);
      } else {
        throw new Error('Project created but response missing id');
      }
    } catch (e: any) {
      console.error('Create project failed:', e);
      alert(`Failed to create project: ${e?.message || String(e)}`);
    }
  };


  // Fetch manager status for all projects after projects are loaded
  useEffect(() => {
    if (!user || projects.length === 0) return;
    const sessionId = localStorage.getItem('oauth_session_id');
    const fetchManagerStatus = async () => {
      const newMap: Record<string, boolean> = {};
      await Promise.all(projects.map(async (project) => {
        try {
          const res = await fetch(`${getApiBase()}/api/projects/${project.id}/is-manager`, {
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${sessionId}`,
              'Content-Type': 'application/json',
            },
          });
          if (res.ok) {
            const data = await res.json();
            newMap[project.id] = !!data.isManager;
          } else {
            newMap[project.id] = false;
          }
        } catch {
          newMap[project.id] = false;
        }
      }));
      setManagerMap(newMap);
    };
    fetchManagerStatus();
  }, [projects, user]);

  // Fetch HDT metadata to check for 3D assets
  useEffect(() => {
    if (projects.length === 0) return;
    
    const fetchAssetStatus = async () => {
      const newMap2D: Record<string, boolean> = {};
      const newMap3D: Record<string, boolean> = {};
      await Promise.all(projects.map(async (project) => {
        try {
          const res = await fetch(`${getApiBase()}/api/projects/${project.id}/hdt`, {
            credentials: 'include',
          });
          if (res.ok) {
            const hdtData = await res.json();
            // Check if there are digital assets of type '3d-model' or 'rti'
            const has3DAssets = hdtData.digitalAssets?.some((asset: any) => asset.type === '3d-model') || false;
            const has2DAssets = hdtData.digitalAssets?.some((asset: any) => asset.type === 'rti') || false;
            newMap3D[project.id] = has3DAssets;
            newMap2D[project.id] = has2DAssets;
          } else {
            newMap3D[project.id] = false;
            newMap2D[project.id] = false;
          }
        } catch {
          newMap3D[project.id] = false;
          newMap2D[project.id] = false;
        }
      }));
      setHas3DAssetsMap(newMap3D);
      setHas2DAssetsMap(newMap2D);
    };
    fetchAssetStatus();
  }, [projects]);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="display-4 mb-3 spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted">Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger mb-3">
          <h3 className="h5">Error Loading Projects</h3>
          <p className="mb-3">{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <h1 className="mb-4 text-dark">
        📁 HDT Projects
      </h1>
      <div className="mb-4 d-flex align-items-center justify-content-between">
        <p className="text-muted mb-0">
          Manage and view all HDT (Heritage Digital Twin) projects in the system.
        </p>
        <div>
          {(user?.sys_creator || user?.sys_admin) && (
            <button className="btn btn-success btn-sm" onClick={createNewProject}>➕ Create New Project</button>
          )}
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="alert alert-info text-center py-5">
          <div className="display-3 mb-2">📁</div>
          <h3 className="mb-2">No HDT Projects Found</h3>
          <p className="mb-0">
            No HDT projects have been created yet. Contact an administrator to add projects.
          </p>
        </div>
      ) : (
        <div className="row g-4">
          {projects.map((project) => (
            <div className="col-12 col-md-6 col-lg-4" key={project.id}>
              <div className="card h-100 shadow-sm">
                <div className="card-body d-flex flex-column">
                  {/* Top Section - Two Columns */}
                  <div className="row mb-3 flex-grow-1">
                    {/* Left Column - Project Name & Description */}
                    <div className="col-8">
                      <h5 className="mb-2 fw-bold">{project.name}</h5>
                      {project.description && (
                        <p 
                          className="text-muted small mb-0" 
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: '1.4em',
                            maxHeight: '4.2em'
                          }}
                        >
                          {project.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Right Column - Manager & Badge */}
                    <div className="col-4 text-end">
                      {project.manager ? (
                        <div className="mb-2">
                          <div className="small text-muted mb-1">Manager:</div>
                          <div className="small fw-semibold">{project.manager.displayName}</div>
                        </div>
                      ) : (
                        <div className="mb-2">
                          <div className="small text-warning">No manager</div>
                        </div>
                      )}
                      {!project.public && (
                        <span className="badge bg-danger">Private</span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Section - Action Buttons */}
                  <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                    {has3DAssetsMap[project.id] ? (
                      <Link
                        to={`/projects/${project.id}`}
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                      >
                        3D
                      </Link>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                        disabled
                        title="No 3D assets available"
                      >
                        3D
                      </button>
                    )}
                    {has2DAssetsMap[project.id] ? (
                      <Link
                        to={`/projects/${project.id}?mode=2d`}
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                      >
                        2D
                      </Link>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                        disabled
                        title="No 2D assets available"
                      >
                        2D
                      </button>
                    )}
                    <Link
                      to={`/projects/${project.id}/hdt`}
                      className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                    >
                      HDT
                    </Link>
                    {managerMap[project.id] && (
                      <Link
                        to={`/projects/${project.id}/edit`}
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center"
                        title="Settings"
                      >
                        Settings
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Future Enhancements box removed */}
    </div>
  );
}
