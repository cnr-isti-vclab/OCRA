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
        📁 Projects
      </h1>
      <div className="mb-4 d-flex align-items-center justify-content-between">
        <p className="text-muted mb-0">
          Manage and view all projects in the system.
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
          <h3 className="mb-2">No Projects Found</h3>
          <p className="mb-0">
            No projects have been created yet. Contact an administrator to add projects.
          </p>
        </div>
      ) : (
        <div className="row g-4">
          {projects.map((project) => (
            <div className="col-12 col-md-6 col-lg-4" key={project.id}>
              <Link to={`/projects/${project.id}`} className="text-decoration-none text-dark">
                <div className="card h-100 shadow-sm project-card">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h3 className="h6 mb-0 flex-grow-1">{project.name}</h3>
                      {!project.public && (
                        <span className="badge bg-danger ms-2">🔒 Private</span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-muted small mb-2">{project.description}</p>
                    )}
                    {project.manager ? (
                      <div className="alert alert-secondary py-1 px-2 mb-2 d-flex align-items-center gap-2">
                        <span>👨‍💼</span>
                        <span className="fw-semibold">Manager:</span>
                        <span className="ms-1 text-muted">{project.manager.displayName}</span>
                      </div>
                    ) : (
                      <div className="alert alert-warning py-1 px-2 mb-2 d-flex align-items-center gap-2">
                        <span>⚠️</span>
                        <span className="fw-semibold">No manager assigned</span>
                      </div>
                    )}
                    <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-2">
                      <div className="small text-muted">
                        <div><strong>Created:</strong> {new Date(project.createdAt).toLocaleDateString()}</div>
                        <div><strong>Updated:</strong> {new Date(project.updatedAt).toLocaleDateString()}</div>
                      </div>
                      {managerMap[project.id] && (
                        <Link
                          to={`/projects/${project.id}/edit`}
                          className="btn btn-sm btn-primary ms-2 fw-bold d-flex align-items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          ✏️ Edit
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      {/* Future Enhancements box removed */}
    </div>
  );
}
