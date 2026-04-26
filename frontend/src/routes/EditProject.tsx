import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';
import {
  ProjectStructuringCoordinator,
  type HeldStructuringLock,
} from '../services/ProjectStructuringCoordinator';
import { ProjectStructuringService } from '../services/ProjectStructuringService';
import {
  StructuringDrainingNotifier,
} from '../services/StructuringDrainingNotifier';
import {
  StructuringEventsService,
  type StructuringRealtimeState,
} from '../services/StructuringEventsService';
import {
  getPhysicalObjectSourceAdapter,
  physicalObjectSourceAdapters,
  type PhysicalObjectSourceType,
} from '../features/physical-object-sources';

async function importPhysicalObjectMetadataViaBackend(
  projectId: string,
  sourceType: 'echoes' | 'wikidata' | 'arco' | 'other',
  sourceUri: string,
  payload?: Record<string, unknown>
): Promise<any> {
  const sessionId = localStorage.getItem('oauth_session_id');
  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/physical-object/import`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sourceType,
      sourceUri,
      payload
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Import failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

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
  const [selectedSourceType, setSelectedSourceType] = useState<PhysicalObjectSourceType>('echoes');
  const [sourceFormState, setSourceFormState] = useState<any>(() => {
    const adapter = getPhysicalObjectSourceAdapter('echoes');
    return adapter ? adapter.createInitialState() : {};
  });
  const [sourceImportLoading, setSourceImportLoading] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);
  
  // Members state
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [selectedEditorId, setSelectedEditorId] = useState<string>('');
  const [selectedViewerId, setSelectedViewerId] = useState<string>('');
  const [addingMember, setAddingMember] = useState(false);
  
  // Manager change confirmation state
  const [showManagerConfirmation, setShowManagerConfirmation] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState<string>('');
  const [originalManagerId, setOriginalManagerId] = useState<string>('');
  
  // Delete confirmation state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [structuringEnabled, setStructuringEnabled] = useState(false);
  const [structuringStatus, setStructuringStatus] = useState<'inactive' | 'acquiring' | 'draining' | 'exclusive' | 'releasing'>('inactive');
  const [structuringError, setStructuringError] = useState<string | null>(null);
  const [structuringRealtimeState, setStructuringRealtimeState] = useState<StructuringRealtimeState>('idle');
  const heldLockRef = useRef<HeldStructuringLock | null>(null);

  const structuringService = useMemo(
    () => (projectId ? new ProjectStructuringService(projectId) : null),
    [projectId],
  );
  const structuringEvents = useMemo(
    () => (projectId ? new StructuringEventsService(projectId) : null),
    [projectId],
  );
  const structuringCoordinator = useMemo(
    () => (projectId && structuringService ? new ProjectStructuringCoordinator(projectId, structuringService) : null),
    [projectId, structuringService],
  );

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

        // Fetch project members
        await fetchProjectMembers();

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

  useEffect(() => {
    if (!structuringEvents) {
      setStructuringRealtimeState('idle');
      return;
    }

    structuringEvents.connect({
      onConnectionStateChange: setStructuringRealtimeState,
    });

    return () => {
      structuringEvents.disconnect();
    };
  }, [structuringEvents]);

  useEffect(() => {
    return () => {
      const heldLock = heldLockRef.current;
      if (!heldLock) {
        return;
      }

      void heldLock.release().catch((error) => {
        console.debug('Structuring lock release failed during cleanup:', error);
      });
    };
  }, []);

  // Helper function to get display name for users
  const getUserDisplayName = (user: SimpleUser): string => {
    return user.name || user.username || user.email;
  };

  // Fetch project members
  const fetchProjectMembers = async () => {
    try {
      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/members`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setProjectMembers(data.members || []);
      }
    } catch (e) {
      console.error('Failed to fetch project members:', e);
    }
  };

  const updateSelectedSourceType = (nextSourceType: PhysicalObjectSourceType) => {
    setSelectedSourceType(nextSourceType);
    const adapter = getPhysicalObjectSourceAdapter(nextSourceType);
    if (adapter) {
      setSourceFormState(adapter.createInitialState());
    }
  };

  const importFromSelectedSource = async () => {
    if (!projectId) return;

    const adapter = getPhysicalObjectSourceAdapter(selectedSourceType);
    if (!adapter) {
      alert(`Unsupported source type: ${selectedSourceType}`);
      return;
    }

    try {
      setSourceImportLoading(true);

      const importRequest = adapter.buildImportRequest(projectId, sourceFormState);
      const importedDoc = await importPhysicalObjectMetadataViaBackend(
        projectId,
        importRequest.sourceType,
        importRequest.sourceUri,
        importRequest.payload
      );

      const dublinCore = importedDoc?.physicalObjectMetadata?.dublinCore || {};

      setShowImportModal(false);
      setHasHdt(true);

      if (dublinCore.title) {
        setName(dublinCore.title);
      }

      alert(`✅ Successfully imported metadata from ${adapter.label}.`);
    } catch (err: any) {
      console.error('Source import error:', err);
      alert('Error importing metadata: ' + (err?.message || String(err)));
    } finally {
      setSourceImportLoading(false);
    }
  };

  // Add editor to project
  const handleAddEditor = async () => {
    if (!selectedEditorId) return;
    
    try {
      setAddingMember(true);
      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/members`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedEditorId,
          role: 'editor'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add editor');
      }

      await fetchProjectMembers();
      setSelectedEditorId('');
    } catch (e: any) {
      console.error('Failed to add editor:', e);
      alert(e?.message || 'Failed to add editor');
    } finally {
      setAddingMember(false);
    }
  };

  // Add viewer to project
  const handleAddViewer = async () => {
    if (!selectedViewerId) return;
    
    try {
      setAddingMember(true);
      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/members`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedViewerId,
          role: 'viewer'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add viewer');
      }

      await fetchProjectMembers();
      setSelectedViewerId('');
    } catch (e: any) {
      console.error('Failed to add viewer:', e);
      alert(e?.message || 'Failed to add viewer');
    } finally {
      setAddingMember(false);
    }
  };

  // Remove member from project
  const handleRemoveMember = async (userId: string, role: string) => {
    if (!confirm(`Are you sure you want to remove this ${role}?`)) return;
    
    try {
      const sessionId = localStorage.getItem('oauth_session_id');
      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to remove ${role}`);
      }

      await fetchProjectMembers();
    } catch (e: any) {
      console.error(`Failed to remove ${role}:`, e);
      alert(e?.message || `Failed to remove ${role}`);
    }
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

  const handleStructuringToggle = async (enabled: boolean) => {
    if (!structuringCoordinator || !structuringEvents || !projectId) {
      return;
    }

    setStructuringError(null);

    if (!enabled) {
      const heldLock = heldLockRef.current;
      if (!heldLock) {
        setStructuringEnabled(false);
        setStructuringStatus('inactive');
        return;
      }

      try {
        setStructuringStatus('releasing');
        await heldLock.release();
        heldLockRef.current = null;
        setStructuringEnabled(false);
        setStructuringStatus('inactive');
      } catch (error) {
        console.error('Failed to release structuring lock:', error);
        setStructuringError(error instanceof Error ? error.message : 'Failed to release structuring lock');
        setStructuringEnabled(true);
        setStructuringStatus('exclusive');
      }
      return;
    }

    if (structuringRealtimeState !== 'connected') {
      setStructuringError('Structuring event channel is not connected yet. Please retry in a moment.');
      setStructuringEnabled(false);
      return;
    }

    try {
      setStructuringEnabled(true);
      setStructuringStatus('acquiring');
      const drainingNotifier = new StructuringDrainingNotifier(structuringEvents);
      const heldLock = await structuringCoordinator.acquireExclusiveLock(
        {
          operationType: 'project.delete',
          operationContext: { projectId },
          drainingNotifier,
          onStateChange: (lock) => {
            setStructuringStatus(lock.state === 'exclusive' ? 'exclusive' : 'draining');
          },
        },
      );

      heldLockRef.current = heldLock;
      setStructuringStatus('exclusive');
    } catch (error) {
      console.error('Failed to acquire structuring lock:', error);
      heldLockRef.current = null;
      setStructuringEnabled(false);
      setStructuringStatus('inactive');
      setStructuringError(error instanceof Error ? error.message : 'Failed to acquire structuring lock');
    }
  };

  const handleDelete = async () => {
    if (!heldLockRef.current) {
      setStructuringError('Enable structuring and wait for the exclusive lock before deleting the project.');
      setShowDeleteConfirmation(false);
      return;
    }

    try {
      setDeleting(true);
      setStructuringError(null);
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

      heldLockRef.current = null;
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
      <h1 className="mb-4 text-dark">Edit Heritage Digital Twin Project</h1>
      <div className="row g-4 align-items-start">
        <div className="col-lg-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h2 className="h5 mb-3 text-dark">Structuring Example</h2>
              <p className="text-muted small mb-3">
                Use this toggle to acquire the project structuring lock before a destructive operation.
                The Delete action is enabled only after the lock reaches exclusive state.
              </p>

              <div className="form-check form-switch mb-3">
                <input
                  id="structuringToggle"
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  checked={structuringEnabled}
                  onChange={(e) => void handleStructuringToggle(e.target.checked)}
                  disabled={deleting || structuringStatus === 'acquiring' || structuringStatus === 'releasing'}
                />
                <label htmlFor="structuringToggle" className="form-check-label fw-bold text-dark">
                  Enable structuring for project delete
                </label>
              </div>

              <div className="small mb-2">
                <strong>Structuring channel:</strong> {structuringRealtimeState}
              </div>
              <div className="small mb-3">
                <strong>Lock state:</strong>{' '}
                {structuringStatus === 'inactive' && 'inactive'}
                {structuringStatus === 'acquiring' && 'acquiring lock'}
                {structuringStatus === 'draining' && 'draining other sessions'}
                {structuringStatus === 'exclusive' && 'exclusive lock acquired'}
                {structuringStatus === 'releasing' && 'releasing lock'}
              </div>

              {structuringStatus === 'draining' && (
                <div className="alert alert-warning py-2 small">
                  Structuring draining is active. Other project sessions are being asked to save their work and leave.
                </div>
              )}

              {structuringStatus === 'exclusive' && (
                <div className="alert alert-success py-2 small mb-3">
                  Exclusive lock acquired. You can now open the delete confirmation and remove the project.
                </div>
              )}

              {structuringError && (
                <div className="alert alert-danger py-2 small mb-0">{structuringError}</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-8">
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          {hasHdt === false && (
            <div className="alert alert-secondary">
              <div className="mb-3">
                <strong>No imported HC1 metadata yet.</strong> Choose a source and provide source-specific input to initialize HC1 metadata.
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowImportModal(true)}
                >
                  Choose Metadata Source
                </button>
              </div>
            </div>
          )}

          {hasHdt === true && (
            <div className="alert alert-light d-flex justify-content-between align-items-center">
              <div>
                <strong>HDT metadata is initialized.</strong>
              </div>
              <Link to={`/projects/${projectId}/hdt`} className="btn btn-outline-primary">
                Open HDT Metadata
              </Link>
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
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link to="/projects" className="btn btn-secondary fw-bold">
                Cancel
              </Link>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmation(true)}
                disabled={saving || deleting || structuringStatus !== 'exclusive'}
                className="btn btn-danger fw-bold ms-auto"
              >
                Delete Project
              </button>
            </div>
            {structuringStatus !== 'exclusive' && (
              <div className="form-text mt-2 text-danger">
                Enable structuring and wait for the exclusive lock before deleting this project.
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Project Members Management */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h3 className="h5 mb-3 text-dark">Project Members</h3>
          
          {/* Editors Section */}
          <div className="mb-4">
            <h4 className="h6 mb-2 text-dark">Editors</h4>
            <div className="form-text mb-2">
              Editors can create and edit annotations
            </div>
            
            {projectMembers.filter(m => m.role === 'editor').length > 0 ? (
              <ul className="list-group mb-3">
                {projectMembers.filter(m => m.role === 'editor').map(member => (
                  <li key={member.userId} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{member.name || member.username || member.email}</strong>
                      {' '}
                      <small className="text-muted">({member.email})</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleRemoveMember(member.userId, 'editor')}
                      disabled={addingMember}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted small mb-3">No editors assigned</p>
            )}

            <div className="input-group">
              <select
                className="form-select"
                value={selectedEditorId}
                onChange={(e) => setSelectedEditorId(e.target.value)}
                disabled={addingMember}
              >
                <option value="">-- Select User --</option>
                {allUsers
                  .filter(user => !projectMembers.find(m => m.userId === user.id))
                  .map(user => (
                    <option key={user.id} value={user.id}>
                      {getUserDisplayName(user)} ({user.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddEditor}
                disabled={!selectedEditorId || addingMember}
              >
                {addingMember ? 'Adding...' : 'Add Editor'}
              </button>
            </div>
          </div>

          {/* Viewers Section */}
          <div>
            <h4 className="h6 mb-2 text-dark">Viewers</h4>
            <div className="form-text mb-2">
              Viewers have read-only access and can export data
            </div>
            
            {projectMembers.filter(m => m.role === 'viewer').length > 0 ? (
              <ul className="list-group mb-3">
                {projectMembers.filter(m => m.role === 'viewer').map(member => (
                  <li key={member.userId} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{member.name || member.username || member.email}</strong>
                      {' '}
                      <small className="text-muted">({member.email})</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleRemoveMember(member.userId, 'viewer')}
                      disabled={addingMember}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted small mb-3">No viewers assigned</p>
            )}

            <div className="input-group">
              <select
                className="form-select"
                value={selectedViewerId}
                onChange={(e) => setSelectedViewerId(e.target.value)}
                disabled={addingMember}
              >
                <option value="">-- Select User --</option>
                {allUsers
                  .filter(user => !projectMembers.find(m => m.userId === user.id))
                  .map(user => (
                    <option key={user.id} value={user.id}>
                      {getUserDisplayName(user)} ({user.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddViewer}
                disabled={!selectedViewerId || addingMember}
              >
                {addingMember ? 'Adding...' : 'Add Viewer'}
              </button>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>

      {/* Manager Change Confirmation Modal */}
      {showManagerConfirmation && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirm Manager Change</h5>
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
                <h5 className="modal-title">Delete Project</h5>
              </div>
              <div className="modal-body">
                <div className="alert alert-warning mb-3">
                  <strong>Warning:</strong> This action cannot be undone!
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
                  disabled={deleting || structuringStatus !== 'exclusive'}
                >
                  {deleting ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* HC1 initialization modal */}
      {showImportModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Initialize HC1 Metadata</h5>
                <button type="button" className="btn-close" onClick={() => setShowImportModal(false)}></button>
              </div>
              <div className="modal-body">
                {/* Source Adapter */}
                {(() => {
                  const selectedSourceAdapter = getPhysicalObjectSourceAdapter(selectedSourceType);
                  if (!selectedSourceAdapter) {
                    return (
                      <div className="alert alert-danger mb-0">
                        Selected source adapter is not available.
                      </div>
                    );
                  }

                  const SourceImportForm = selectedSourceAdapter.ImportForm;

                  return (
                    <div>
                      <div className="mb-3">
                        <label htmlFor="sourceTypeSelect" className="form-label">Source Type</label>
                        <select
                          id="sourceTypeSelect"
                          className="form-select"
                          value={selectedSourceType}
                          onChange={(e) => updateSelectedSourceType(e.target.value as PhysicalObjectSourceType)}
                          disabled={sourceImportLoading}
                        >
                          {physicalObjectSourceAdapters.map((adapter) => (
                            <option key={adapter.sourceType} value={adapter.sourceType}>
                              {adapter.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="text-muted small">{selectedSourceAdapter.description}</p>

                      <SourceImportForm
                        state={sourceFormState}
                        onChange={setSourceFormState}
                        disabled={sourceImportLoading}
                      />

                      <button
                        className="btn btn-primary mt-3"
                        onClick={importFromSelectedSource}
                        disabled={sourceImportLoading}
                      >
                        {sourceImportLoading ? '⏳ Importing...' : `Import from ${selectedSourceAdapter.label}`}
                      </button>

                      <div className="alert alert-info mt-3 small mb-0">
                        The selected source adapter prepares a source-specific request, and the backend transforms it into <code>physicalObjectMetadata</code>.
                      </div>
                    </div>
                  );
                })()}
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