import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHdt, setHasHdt] = useState<boolean | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  
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
  
  // Delete confirmation state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        if (!sessionId) {
          throw new Error('No session found');
        }

        // Use backend API to check if user is manager
        const isManagerResponse = await fetch(`${getApiBase()}/api/projects/${projectId}/is-manager`, {
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
        const projectResponse = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
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
        const usersResponse = await fetch(`${getApiBase()}/api/users/list`, {
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

        // Check if HDT metadata exists for this project
        try {
          const hdtRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (hdtRes.status === 404) {
            setHasHdt(false);
          } else if (hdtRes.ok) {
            setHasHdt(true);
          } else {
            setHasHdt(true); // default to true on unexpected error to avoid showing import incorrectly
          }
        } catch (e) {
          setHasHdt(true);
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

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const sessionId = localStorage.getItem('oauth_session_id');

      const response = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete project');
      }

      // Success - navigate back to projects list
      navigate('/projects');
    } catch (e: any) {
      console.error('Failed to delete project:', e);
      setError(e?.message ?? String(e));
      setShowDeleteConfirmation(false);
    } finally {
      setDeleting(false);
    }
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

      const response = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
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
            <Link to="/projects" className="btn btn-primary">Back to HDT Projects</Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container py-5">
          <h1 className="mb-3">HDT Project not found</h1>
          <Link to="/projects" className="btn btn-secondary">Back to HDT Projects</Link>
        </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="mb-3">
        <Link to="/projects" className="text-primary text-decoration-none small">← Back to HDT Projects</Link>
      </div>
  <h1 className="mb-4 text-dark">✏️ Edit Heritage Digital Twin Project</h1>
      <div className="card shadow-sm mb-4" style={{ maxWidth: 600 }}>
        <div className="card-body">
          {hasHdt === false && (
            <div className="alert alert-secondary d-flex justify-content-between align-items-center">
              <div>
                <strong>No HDT metadata yet.</strong> You can import an existing HDT definition to initialize it.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowImportModal(true)}
              >
                ⬆️ Import HDT
              </button>
            </div>
          )}
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
                disabled={saving || deleting}
                className="btn btn-success fw-bold"
              >
                {saving ? '💾 Saving...' : '💾 Save Changes'}
              </button>
              <Link to="/projects" className="btn btn-secondary fw-bold">
                Cancel
              </Link>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                disabled={saving || deleting}
                className="btn btn-danger fw-bold ms-auto"
              >
                🗑️ Delete Project
              </button>
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
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">🗑️ Delete Project</h5>
              </div>
              <div className="modal-body">
                <div className="alert alert-warning mb-3">
                  <strong>⚠️ Warning:</strong> This action cannot be undone!
                </div>
                <p>Are you sure you want to delete this project?</p>
                <div className="bg-light p-3 rounded mb-2">
                  <div><strong>Project Name:</strong> {project?.name}</div>
                  {project?.description && (
                    <div><strong>Description:</strong> {project.description}</div>
                  )}
                </div>
                <p className="text-danger mb-0">
                  <strong>All project data, including files, annotations, and scene configurations will be permanently deleted.</strong>
                </p>
              </div>
              <div className="modal-footer">
                <button 
                  onClick={() => setShowDeleteConfirmation(false)} 
                  className="btn btn-secondary"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete} 
                  className="btn btn-danger"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Import HDT Modal with file upload */}
      {showImportModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">⬆️ Import HDT</h5>
                <button type="button" className="btn-close" onClick={() => setShowImportModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label htmlFor="hdtRdfFile" className="form-label">Upload RDF (JSON-LD) file</label>
                  <input
                    type="file"
                    id="hdtRdfFile"
                    accept=".json,.jsonld,.rdf,.ttl,.txt,application/json,application/ld+json"
                    className="form-control"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        let data;
                        try {
                          data = JSON.parse(text);
                        } catch (err) {
                          alert('Could not parse file as JSON-LD. Please check the format.');
                          return;
                        }
                        
                        console.log('📥 Parsed RDF data:', data);
                        
                        // Map RDF fields to HDT Dublin Core metadata
                        const dublinCore = {
                          title: data['dc:title'],
                          creator: data['dc:creator']?.['foaf:name'] || data['dc:creator']?.['@id'] || data['dc:creator'],
                          date: data['dc:date'],
                          description: data['dc:description'],
                          coverage: data['dc:coverage'],
                          rights: data['dc:rights'],
                          identifier: data['dc:identifier'],
                          subject: data['dc:subject'],
                          type: data['dc:type'],
                          language: data['dc:language'],
                          source: data['dc:source'],
                        };

                        console.log('📝 Mapped Dublin Core:', dublinCore);

                        // Create or update HDT metadata via backend
                        const sessionId = localStorage.getItem('oauth_session_id');
                        const hdtPayload = {
                          dublinCore,
                          cidocCrm: {},
                          gettyAAT: {},
                          digitalAssets: [],
                          scenes: []
                        };

                        console.log('🚀 Sending HDT payload:', hdtPayload);

                        // Check if HDT exists
                        const checkRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                        });

                        console.log('🔍 Check HDT status:', checkRes.status);

                        let response;
                        if (checkRes.status === 404) {
                          // Create new HDT
                          console.log('📝 Creating new HDT metadata...');
                          response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
                            method: 'POST',
                            credentials: 'include',
                            headers: {
                              'Authorization': `Bearer ${sessionId}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(hdtPayload)
                          });
                        } else {
                          // Update existing HDT
                          console.log('📝 Updating existing HDT metadata...');
                          response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
                            method: 'PUT',
                            credentials: 'include',
                            headers: {
                              'Authorization': `Bearer ${sessionId}`,
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(hdtPayload)
                          });
                        }

                        console.log('📤 Response status:', response.status);

                        if (!response.ok) {
                          const errText = await response.text();
                          console.error('❌ Error response:', errText);
                          let errData;
                          try {
                            errData = JSON.parse(errText);
                          } catch {
                            errData = { error: errText };
                          }
                          throw new Error(errData.error || `HTTP ${response.status}: ${errText}`);
                        }

                        const result = await response.json();
                        console.log('✅ Success response:', result);

                        setShowImportModal(false);
                        setHasHdt(true); // Update state so button disappears
                        
                        // Update project name with dc:title from RDF
                        if (dublinCore.title) {
                          setName(dublinCore.title);
                        }
                        
                        // Show success message
                        alert('✅ RDF imported successfully!\n\nThe Dublin Core metadata has been saved.\nThe project title field has been updated with the dc:title from the RDF file.\n\nYou can now save the project settings or navigate to the HDT page to view all imported metadata.');
                      } catch (err: any) {
                        console.error('❌ Import error:', err);
                        alert('Error importing RDF: ' + (err?.message || String(err)));
                      }
                    }}
                  />
                  <div className="form-text">Supported: JSON-LD RDF files. Only basic fields will be imported.</div>
                </div>
                <div className="alert alert-info">
                  Upload an RDF (JSON-LD) file to import Dublin Core metadata. All fields (title, creator, date, description, coverage, rights, etc.) will be saved to the HDT metadata document.
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Close</button>
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