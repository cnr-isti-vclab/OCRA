import 'bootstrap/dist/css/bootstrap.min.css';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { appendStoredSessionId, getApiBase } from '../config/oauth';
import { useProjectStructuringLock } from '../context/ProjectStructuringLockContext';
import type { CurrentUserSummary, ProjectListItem } from '../types';
import EchoesImportModal from './components/EchoesImportModal';

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

export default function Projects() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [user, setUser] = useState<CurrentUserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Map of projectId to isManager boolean
  const [managerMap, setManagerMap] = useState<Record<string, boolean>>({});
  // Map of projectId to has3DAssets boolean
  const [has3DAssetsMap, setHas3DAssetsMap] = useState<Record<string, boolean>>({});
  const [has2DAssetsMap, setHas2DAssetsMap] = useState<Record<string, boolean>>({});
  // Map of projectId to HDT document existence
  const [hasHdtMap, setHasHdtMap] = useState<Record<string, boolean>>({});

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectPublic, setNewProjectPublic] = useState(false);
  const [showEchoesImportModal, setShowEchoesImportModal] = useState(false);
  const navigate = useNavigate();
  const { getProjectLockState, toggleProjectLock } = useProjectStructuringLock();

  const fetchData = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;

    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const sessionId = localStorage.getItem('oauth_session_id');

      if (!sessionId) {
        throw new Error('No session found');
      }

      // Fetch current user information
      const userResponse = await fetch(`${getApiBase()}/api/sessions/current`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUser(userData.user);
      }

      const response = await fetch(`${getApiBase()}/api/projects`, {
        credentials: 'include',
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
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const source = new EventSource(
      appendStoredSessionId(new URL(`${getApiBase()}/api/projects/events`)).toString(),
      { withCredentials: true },
    );

    const handleCatalogChanged = () => {
      void fetchData({ showLoading: false });
    };

    source.addEventListener('project.catalog.changed', handleCatalogChanged);

    source.onerror = () => {
      console.debug('Project catalog SSE disconnected; browser will retry automatically.');
    };

    return () => {
      source.removeEventListener('project.catalog.changed', handleCatalogChanged);
      source.close();
    };
  }, [fetchData]);

  useEffect(() => {
    const activeLockExpiryTimes = projects
      .filter((project) => project.activeStructuringLock && !!project.activeStructuringLockHeartbeatExpiresAt)
      .map((project) => Date.parse(project.activeStructuringLockHeartbeatExpiresAt as string))
      .filter((value) => !Number.isNaN(value));

    if (activeLockExpiryTimes.length === 0) {
      return;
    }

    const nextExpiryAt = Math.min(...activeLockExpiryTimes);
    const refreshDelayMs = Math.max(1_000, nextExpiryAt - Date.now() + 1_000);

    const timerId = window.setTimeout(() => {
      void fetchData({ showLoading: false });
    }, refreshDelayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [projects, fetchData]);

  const openCreateProjectModal = () => {
    setCreateError(null);
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectPublic(false);
    setShowCreateModal(true);
  };

  // Create a new project. HC1 metadata initialization is done explicitly afterward.
  const createNewProject = async () => {
    try {
      setCreatingProject(true);
      setCreateError(null);

      const trimmedName = newProjectName.trim();
      if (!trimmedName) {
        throw new Error('Project name is required');
      }

      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({
          name: trimmedName,
          description: newProjectDescription.trim() || undefined,
          public: newProjectPublic
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create project: ${response.status} - ${err}`);
      }

      const data = await response.json();
      const created = data.project || data;
      if (created && created.id) {
        setShowCreateModal(false);
        navigate(`/projects/${created.id}/edit`);
      } else {
        throw new Error('Project created but response missing id');
      }
    } catch (e: any) {
      console.error('Create project failed:', e);
      setCreateError(e?.message || String(e));
    } finally {
      setCreatingProject(false);
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
      const newHdtMap: Record<string, boolean> = {};
      await Promise.all(projects.map(async (project) => {
        if (project.activeStructuringLock) {
          return;
        }

        try {
          const res = await fetch(`${getApiBase()}/api/projects/${project.id}/hdt`, {
            credentials: 'include',
          });
          if (res.ok) {
            const hdtData = await res.json();
            newHdtMap[project.id] = true;
            // Check if there are digital assets of type '3d-model'
            const has3DAssets = hdtData.digitalAssets?.some((asset: any) => asset.type === '3d-model') || false;
            const has2DAssets = hdtData.digitalAssets?.some((asset: any) => asset.type === 'rti') || false;
            newMap3D[project.id] = has3DAssets;
            newMap2D[project.id] = has2DAssets;
          } else if (res.status === 423) {
            // Locked projects are handled by activeStructuringLock in the catalog state.
            // Keep the last known asset availability instead of degrading to false.
            return;
          } else {
            newMap3D[project.id] = false;
            newMap2D[project.id] = false;
            newHdtMap[project.id] = false;
          }
        } catch {
          newMap3D[project.id] = false;
          newMap2D[project.id] = false;
          newHdtMap[project.id] = false;
        }
      }));
      setHas3DAssetsMap((current) => ({ ...current, ...newMap3D }));
      setHas2DAssetsMap((current) => ({ ...current, ...newMap2D }));
      setHasHdtMap((current) => ({ ...current, ...newHdtMap }));
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
        <div className="d-flex gap-2">
          {(user?.sys_creator || user?.sys_admin) && (
            <button className="btn btn-success btn-sm" onClick={openCreateProjectModal}>➕ Create New Project</button>
          )}
          {(user?.sys_creator || user?.sys_admin) && (
            <button className="btn btn-outline-primary btn-sm" onClick={() => setShowEchoesImportModal(true)}>
              Import from ECCCH
            </button>
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
              {(() => {
                const lockState = getProjectLockState(project.id);
                const ownedByCurrentSession = !!project.activeStructuringLockOwnedByCurrentSession || lockState.enabled;
                const lockedByAnotherSession = !!project.activeStructuringLock && !ownedByCurrentSession;
                const structuringActive = !!project.activeStructuringLock || lockState.enabled || lockState.status !== 'inactive';
                const unmanagedOwnedLock = !!project.activeStructuringLockOwnedByCurrentSession && !lockState.enabled && !lockState.hasExclusiveLock;
                return (
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
                        <span className="badge bg-danger ms-1">Private</span>
                      )}
                      {lockedByAnotherSession && (
                        <span
                          className="badge bg-warning text-dark mt-1 d-inline-block text-wrap text-start"
                          style={{ maxWidth: '100%' }}
                        >
                          Structuring...
                        </span>
                      )}
                      {ownedByCurrentSession && (
                        <span className="badge bg-success ms-1">Your lock</span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Section - Action Buttons */}
                  <div className="d-grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                    {has3DAssetsMap[project.id] && !structuringActive ? (
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
                        title={structuringActive ? 'Viewer access is disabled while structuring lock is active' : 'No 3D assets available'}
                      >
                        3D
                      </button>
                    )}
                    {has2DAssetsMap[project.id] && !structuringActive ? (
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
                        title={structuringActive ? 'Viewer access is disabled while structuring lock is active' : 'No 2D assets available'}
                      >
                        2D
                      </button>
                    )}
                    {lockedByAnotherSession ? (
                      <button
                        className="btn btn-secondary btn-sm d-flex align-items-center justify-content-center gap-1"
                        disabled
                        title="Project is temporarily read-only while structuring is in progress"
                      >
                        HDT
                      </button>
                    ) : hasHdtMap[project.id] === false && managerMap[project.id] ? (
                      <Link
                        to={`/projects/${project.id}/edit`}
                        className="btn btn-outline-warning btn-sm d-flex align-items-center justify-content-center gap-1"
                        title="Initialize metadata before opening the HDT editor"
                      >
                        Setup HDT
                      </Link>
                    ) : (
                      <Link
                        to={`/projects/${project.id}/hdt`}
                        className="btn btn-primary btn-sm d-flex align-items-center justify-content-center gap-1"
                      >
                        HDT
                      </Link>
                    )}
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

                  {managerMap[project.id] && (
                    <div className="mt-3 pt-3 border-top">
                      <div className="rounded p-2" style={{ backgroundColor: '#fff8e1', border: '1px solid #f0d98a' }}>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="small fw-semibold text-dark">Project Structuring Lock</div>
                            <div className="small text-muted">
                              {lockState.hasExclusiveLock
                                ? 'Exclusive lock acquired for this project.'
                                : unmanagedOwnedLock
                                  ? 'An active lock exists for this session, but this tab is not managing its heartbeat.'
                                  : `${project.activeUserCount} active user${project.activeUserCount === 1 ? '' : 's'}`}
                            </div>
                          </div>
                          <div className="form-check form-switch m-0">
                            <input
                              id={`project-structuring-toggle-${project.id}`}
                              className="form-check-input"
                              type="checkbox"
                              role="switch"
                              checked={lockState.enabled}
                              onChange={(e) => void toggleProjectLock(project.id, e.target.checked)}
                              disabled={lockState.status === 'acquiring' || lockState.status === 'releasing' || lockState.status === 'canceling' || lockedByAnotherSession}
                            />
                          </div>
                        </div>
                        <div className="small mt-2 text-dark">
                          <strong>Status:</strong>{' '}
                          {unmanagedOwnedLock && 'lock active outside this tab'}
                          {!unmanagedOwnedLock && lockState.status === 'inactive' && 'inactive'}
                          {!unmanagedOwnedLock && lockState.status === 'acquiring' && 'acquiring lock'}
                          {!unmanagedOwnedLock && lockState.status === 'draining' && 'draining other sessions'}
                          {!unmanagedOwnedLock && lockState.status === 'exclusive' && 'exclusive lock acquired'}
                          {!unmanagedOwnedLock && lockState.status === 'releasing' && 'releasing lock'}
                          {!unmanagedOwnedLock && lockState.status === 'canceling' && 'canceling draining'}
                        </div>
                        {lockState.error && (
                          <div className="small text-danger mt-1">{lockState.error}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Project</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => !creatingProject && setShowCreateModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                {createError && (
                  <div className="alert alert-danger">{createError}</div>
                )}

                <div className="mb-3">
                  <label htmlFor="newProjectName" className="form-label">Project Name</label>
                  <input
                    id="newProjectName"
                    type="text"
                    className="form-control"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter a project name"
                    disabled={creatingProject}
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="newProjectDescription" className="form-label">Description</label>
                  <textarea
                    id="newProjectDescription"
                    rows={3}
                    className="form-control"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Optional project description"
                    disabled={creatingProject}
                  ></textarea>
                </div>

                <div className="form-check mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="newProjectPublic"
                    checked={newProjectPublic}
                    onChange={(e) => setNewProjectPublic(e.target.checked)}
                    disabled={creatingProject}
                  />
                  <label className="form-check-label" htmlFor="newProjectPublic">
                    Public Project
                  </label>
                </div>

                <div className="alert alert-light border mb-0">
                  <strong>Next step:</strong> after creation, the project starts with no imported HC1 metadata.
                  Open project settings and choose a source adapter (ECHOES, ARCO, Wikidata, ...).
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creatingProject}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={createNewProject}
                  disabled={creatingProject}
                >
                  {creatingProject ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <EchoesImportModal
        show={showEchoesImportModal}
        onClose={() => setShowEchoesImportModal(false)}
        onImported={(projectId) => {
          setShowEchoesImportModal(false);
          void fetchData({ showLoading: false });
          navigate(`/projects/${projectId}/edit`);
        }}
      />
      {/* Future Enhancements box removed */}
    </div>
  );
}
