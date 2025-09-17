import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

/**
 * EDIT PROJECT COMPONENT
 * 
 * This component allows project managers to edit project details.
 * Only users who are managers of the specific project can access this page.
 * 
 * Features:
 * - Edit project name and description
 * - Form validation
 * - Save changes with API call
 * - Navigation back to projects list
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
    email: string;
    name?: string;
    username?: string;
    displayName: string;
  } | null;
}

interface SimpleUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  given_name?: string;
  family_name?: string;
}

export default function EditProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);
  
  // Manager change confirmation state
  const [showManagerConfirmation, setShowManagerConfirmation] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState<string>('');
  const [originalManagerId, setOriginalManagerId] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        if (!sessionId) {
          throw new Error('No session found');
        }

        // Use backend API to check if user is manager
        const isManagerResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}/is-manager`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
          },
        });
        if (!isManagerResponse.ok) {
          throw new Error('Failed to check manager permissions');
        }
        const isManagerData = await isManagerResponse.json();
        if (!isManagerData.isManager) {
          throw new Error('You do not have permission to edit this project');
        }

        // Fetch project details
        const projectResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!projectResponse.ok) {
          if (projectResponse.status === 404) {
            throw new Error('Project not found');
          }
          throw new Error('Failed to fetch project details');
        }
        const projectData = await projectResponse.json();
        setProject(projectData.project);
        setName(projectData.project.name);
        setDescription(projectData.project.description || '');
        setIsPublic(projectData.project.public || false);
        // Set initial manager
        const managerId = projectData.project.manager?.id || '';
        setSelectedManagerId(managerId);
        setOriginalManagerId(managerId);

        // Fetch all users for manager dropdown
        const usersResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/users/list`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
          },
        });
        if (usersResponse.ok) {
          const usersData = await usersResponse.json();
          setAllUsers(usersData);
        } else {
          console.warn('Failed to fetch users for manager dropdown');
        }
      } catch (e: any) {
        console.error('Failed to fetch data:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

  // Helper function to get display name for users
  const getUserDisplayName = (user: SimpleUser): string => {
    return user.name || user.username || user.email;
  };

  // Handle manager change with confirmation
  const handleManagerChange = (newManagerId: string) => {
    if (newManagerId !== originalManagerId) {
      setPendingManagerId(newManagerId);
      setShowManagerConfirmation(true);
    } else {
      setSelectedManagerId(newManagerId);
    }
  };

  const confirmManagerChange = () => {
    setSelectedManagerId(pendingManagerId);
    setShowManagerConfirmation(false);
    setPendingManagerId('');
  };

  const cancelManagerChange = () => {
    setShowManagerConfirmation(false);
    setPendingManagerId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    setNameError(null);
    
    if (!name.trim()) {
      setNameError('Project name is required');
      return;
    }

    try {
      setSaving(true);
      const sessionId = localStorage.getItem('oauth_session_id');

      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
        method: 'PUT',
        credentials: 'include', // Include session cookies
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          public: isPublic,
          managerId: selectedManagerId || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update project');
      }

      // Success - navigate back to projects
      navigate('/projects');
    } catch (e: any) {
      console.error('Failed to update project:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="display-4 mb-3">⚙️</div>
        <p className="text-muted">Loading project details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger mb-3">
          <h3 className="h5">Error</h3>
          <p className="mb-3">{error}</p>
          <Link to="/projects" className="btn btn-primary">Back to Projects</Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container py-5">
        <h1 className="mb-3">Project not found</h1>
        <Link to="/projects" className="btn btn-secondary">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="mb-3">
        <Link to="/projects" className="text-primary text-decoration-none small">← Back to Projects</Link>
      </div>
      <h1 className="mb-4 text-dark">✏️ Edit Project</h1>
      <div className="card shadow-sm mb-4" style={{ maxWidth: 600 }}>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="projectName" className="form-label fw-bold text-dark">
                Project Name *
              </label>
              <input
                id="projectName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`form-control${nameError ? ' is-invalid' : ''}`}
                placeholder="Enter project name"
                disabled={saving}
              />
              {nameError && (
                <div className="invalid-feedback">{nameError}</div>
              )}
            </div>
            <div className="mb-3">
              <label htmlFor="projectDescription" className="form-label fw-bold text-dark">
                Description
              </label>
              <textarea
                id="projectDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="form-control"
                placeholder="Enter project description (optional)"
                disabled={saving}
              />
            </div>
            <div className="form-check mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                id="publicCheck"
                disabled={saving}
              />
              <label className="form-check-label fw-bold text-dark" htmlFor="publicCheck">
                Public Project
              </label>
              <div className="form-text ms-4">
                Public projects are visible to all users, including those not logged in
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="projectManager" className="form-label fw-bold text-dark">
                Project Manager
              </label>
              <select
                id="projectManager"
                value={selectedManagerId}
                onChange={(e) => handleManagerChange(e.target.value)}
                className="form-select"
                disabled={saving}
              >
                <option value="">-- No Manager --</option>
                {allUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {getUserDisplayName(user)} ({user.email})
                  </option>
                ))}
              </select>
              <div className="form-text">
                Project managers can edit project details and manage access
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-success fw-bold"
              >
                {saving ? '💾 Saving...' : '💾 Save Changes'}
              </button>
              <Link to="/projects" className="btn btn-secondary fw-bold">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
      {/* Manager Change Confirmation Modal */}
      {showManagerConfirmation && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">🔄 Confirm Manager Change</h5>
              </div>
              <div className="modal-body">
                <p>Are you sure you want to change the project manager?</p>
                <div className="bg-light p-2 rounded mb-2">
                  <div className="mb-1">
                    <strong>Current Manager:</strong>{' '}
                    <span className="text-danger">
                      {originalManagerId 
                        ? (() => {
                            const user = allUsers.find(u => u.id === originalManagerId);
                            return user ? getUserDisplayName(user) : 'Unknown';
                          })()
                        : 'No Manager'
                      }
                    </span>
                  </div>
                  <div>
                    <strong>New Manager:</strong>{' '}
                    <span className="text-success">
                      {pendingManagerId 
                        ? (() => {
                            const user = allUsers.find(u => u.id === pendingManagerId);
                            return user ? getUserDisplayName(user) : 'Unknown';
                          })()
                        : 'No Manager'
                      }
                    </span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button onClick={cancelManagerChange} className="btn btn-secondary">
                  Cancel
                </button>
                <button onClick={confirmManagerChange} className="btn btn-primary">
                  Confirm Change
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="alert alert-info mt-4">
        <strong>📝 Note:</strong> Changes will be saved immediately. Make sure all information is correct before saving.
      </div>
    </div>
  );
}