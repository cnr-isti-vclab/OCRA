import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';
import * as N3 from 'n3';

// Default values for Echoes KB Manager API
const DEFAULT_ECHOES_ENDPOINT = 'https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query';
const DEFAULT_ECHOES_QUERY = `{
  "query": "PREFIX htdo: <http://heritage-digital-twin-ontology/> PREFIX void: <http://rdfs.org/ns/void#> SELECT distinct ?s ?p ?o { graph ?ng { values ?dt {<https://demo/HeritageDigitalTwin/CNR/OCRADEMO_12345>} ?dt a void:Dataset; void:subset ?ng . ?s ?p ?o} }",
  "tripleStoreIds": [
    "69088495d17ed4f51ab8f6a8",
    "69088509d17ed4f51ab8f6a9",
    "690885c3d17ed4f51ab8f6aa"
  ],
  "executorTripleStoreId": "68fa3ad9f20fe43d497686b3"
}`;

/**
 * Convert SPARQL JSON results to N3 Quads
 * @param sparqlJson SPARQL JSON results object
 * @returns Array of N3 Quads
 */
function sparqlJsonToQuads(sparqlJson: any): N3.Quad[] {
  const { DataFactory } = N3;
  const quads: N3.Quad[] = [];
  
  if (!sparqlJson?.results?.bindings) {
    throw new Error('Invalid SPARQL JSON format');
  }
  
  for (const binding of sparqlJson.results.bindings) {
    // Extract subject, predicate, object from binding
    const s = binding.s || binding.subject;
    const p = binding.p || binding.predicate;
    const o = binding.o || binding.object;
    
    if (!s || !p || !o) continue;
    
    // Create subject term
    let subject: N3.Quad_Subject;
    if (s.type === 'uri' || s.type === 'iri') {
      subject = DataFactory.namedNode(s.value);
    } else if (s.type === 'bnode') {
      subject = DataFactory.blankNode(s.value);
    } else {
      continue; // Skip invalid subjects
    }
    
    // Create predicate term (must be URI)
    if (p.type !== 'uri' && p.type !== 'iri') continue;
    const predicate = DataFactory.namedNode(p.value);
    
    // Create object term
    let object: N3.Quad_Object;
    if (o.type === 'uri' || o.type === 'iri') {
      object = DataFactory.namedNode(o.value);
    } else if (o.type === 'bnode') {
      object = DataFactory.blankNode(o.value);
    } else if (o.type === 'literal' || o.type === 'typed-literal') {
      if (o.datatype) {
        object = DataFactory.literal(o.value, DataFactory.namedNode(o.datatype));
      } else if (o['xml:lang'] || o.lang) {
        object = DataFactory.literal(o.value, o['xml:lang'] || o.lang);
      } else {
        object = DataFactory.literal(o.value);
      }
    } else {
      continue; // Skip invalid objects
    }
    
    quads.push(DataFactory.quad(subject, predicate, object));
  }
  
  return quads;
}

/**
 * Extract Dublin Core metadata from RDF quads
 * @param quads Array of N3 Quads
 * @returns Dublin Core metadata object
 */
function extractDublinCoreFromQuads(quads: N3.Quad[]): any {
  const getValue = (term: N3.Term | null): string => {
    if (!term) return '';
    return term.value;
  };
  
  const dcNamespace = 'http://purl.org/dc/elements/1.1/';
  const foafNamespace = 'http://xmlns.com/foaf/0.1/';
  const dublinCore: any = {};
  const creatorNodes = new Set<string>();
  
  // First pass: extract Dublin Core properties
  for (const quad of quads) {
    const p = quad.predicate.value;
    if (p === dcNamespace + 'title') {
      dublinCore.title = getValue(quad.object);
    } else if (p === dcNamespace + 'creator') {
      if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
        creatorNodes.add(quad.object.value);
      } else {
        dublinCore.creator = getValue(quad.object);
      }
    } else if (p === dcNamespace + 'date') {
      dublinCore.date = getValue(quad.object);
    } else if (p === dcNamespace + 'description') {
      dublinCore.description = getValue(quad.object);
    } else if (p === dcNamespace + 'coverage') {
      dublinCore.coverage = getValue(quad.object);
    } else if (p === dcNamespace + 'rights') {
      dublinCore.rights = getValue(quad.object);
    } else if (p === dcNamespace + 'identifier') {
      dublinCore.identifier = getValue(quad.object);
    } else if (p === dcNamespace + 'subject') {
      dublinCore.subject = getValue(quad.object);
    } else if (p === dcNamespace + 'type') {
      dublinCore.type = getValue(quad.object);
    } else if (p === dcNamespace + 'language') {
      dublinCore.language = getValue(quad.object);
    } else if (p === dcNamespace + 'source') {
      dublinCore.source = getValue(quad.object);
    }
  }
  
  // Second pass: resolve creator names from foaf:name
  if (creatorNodes.size > 0 && !dublinCore.creator) {
    for (const quad of quads) {
      if (creatorNodes.has(quad.subject.value) && quad.predicate.value === foafNamespace + 'name') {
        dublinCore.creator = getValue(quad.object);
        break;
      }
    }
  }
  
  return dublinCore;
}

/**
 * EXPERIMENTAL: Import HDT metadata from Echoes KB Manager API
 * 
 * This function handles the complete workflow of querying the Echoes KB Manager API
 * and extracting Dublin Core metadata from the results.
 * 
 * API Format:
 * - Endpoint: https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query
 * - Method: POST
 * - Content-Type: application/json
 * - Body: { query: string, tripleStoreIds: string[], executorTripleStoreId: string }
 * 
 * @param endpointUrl The API endpoint URL (e.g., Echoes KB Manager query endpoint)
 * @param queryPayloadJson JSON string containing query, tripleStoreIds, and executorTripleStoreId
 * @returns Promise with Dublin Core metadata and quad count
 */
async function importFromSparqlEndpoint(
  endpointUrl: string,
  queryPayloadJson: string
): Promise<{ dublinCore: any; quadCount: number }> {
  // Parse the JSON payload
  let queryPayload;
  try {
    queryPayload = JSON.parse(queryPayloadJson);
  } catch (e) {
    throw new Error('Query payload must be valid JSON with query, tripleStoreIds, and executorTripleStoreId fields');
  }
  
  // Validate required fields
  if (!queryPayload.query || !queryPayload.tripleStoreIds || !queryPayload.executorTripleStoreId) {
    throw new Error('Query payload must include query, tripleStoreIds, and executorTripleStoreId');
  }
  
  // Use backend proxy to avoid CORS issues
  const sessionId = localStorage.getItem('oauth_session_id');
  const response = await fetch(`${getApiBase()}/api/sparql-proxy`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      endpoint: endpointUrl,
      payload: queryPayload
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
  }
  
  let sparqlJson = await response.json();
  
  // Handle wrapped responses (e.g., {"succeed": true, "results": {...}})
  if (sparqlJson.succeed && sparqlJson.results) {
    sparqlJson = sparqlJson.results;
  }
  
  // Convert SPARQL JSON to RDF quads
  const quads = sparqlJsonToQuads(sparqlJson);
  
  if (quads.length === 0) {
    throw new Error('No RDF triples found in SPARQL results');
  }
  
  // Extract Dublin Core metadata from quads
  const dublinCore = extractDublinCoreFromQuads(quads);
  
  return {
    dublinCore,
    quadCount: quads.length
  };
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
  const [importMode, setImportMode] = useState<'file' | 'sparql'>('file');
  const [sparqlEndpoint, setSparqlEndpoint] = useState('');
  const [sparqlQuery, setSparqlQuery] = useState('');
  const [sparqlLoading, setSparqlLoading] = useState(false);
  
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

      {/* Project Members Management */}
      <div className="card shadow-sm mb-4" style={{ maxWidth: 600 }}>
        <div className="card-body">
          <h3 className="h5 mb-3 text-dark">👥 Project Members</h3>
          
          {/* Editors Section */}
          <div className="mb-4">
            <h4 className="h6 mb-2 text-dark">✏️ Editors</h4>
            <div className="form-text mb-2">
              Editors can create and edit annotations
            </div>
            
            {projectMembers.filter(m => m.role === 'editor').length > 0 ? (
              <ul className="list-group mb-3">
                {projectMembers.filter(m => m.role === 'editor').map(member => (
                  <li key={member.userId} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{member.name || member.username || member.email}</strong>
                      <br />
                      <small className="text-muted">{member.email}</small>
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
            <h4 className="h6 mb-2 text-dark">👁️ Viewers</h4>
            <div className="form-text mb-2">
              Viewers have read-only access and can export data
            </div>
            
            {projectMembers.filter(m => m.role === 'viewer').length > 0 ? (
              <ul className="list-group mb-3">
                {projectMembers.filter(m => m.role === 'viewer').map(member => (
                  <li key={member.userId} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{member.name || member.username || member.email}</strong>
                      <br />
                      <small className="text-muted">{member.email}</small>
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
                {/* Tab Navigation */}
                <ul className="nav nav-tabs mb-3" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${importMode === 'file' ? 'active' : ''}`}
                      onClick={() => setImportMode('file')}
                      type="button"
                    >
                      📁 Upload File
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${importMode === 'sparql' ? 'active' : ''}`}
                      onClick={() => setImportMode('sparql')}
                      type="button"
                    >
                      🔍 SPARQL Endpoint
                    </button>
                  </li>
                </ul>

                {/* File Upload Tab */}
                {importMode === 'file' && (
                  <div>
                    <div className="mb-3">
                      <label htmlFor="hdtRdfFile" className="form-label">Upload RDF file</label>
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
                        
                        // Parse RDF using N3 (supports JSON-LD, Turtle, RDF/XML, N-Triples)
                        const parser = new N3.Parser();
                        const quads: N3.Quad[] = [];
                        
                        await new Promise<void>((resolve, reject) => {
                          parser.parse(text, (error, quad, prefixes) => {
                            if (error) {
                              reject(error);
                              return;
                            }
                            if (quad) {
                              quads.push(quad);
                            } else {
                              // Parsing complete
                              resolve();
                            }
                          });
                        });
                        
                        if (quads.length === 0) {
                          alert('No RDF data found in file. Please check the format.');
                          return;
                        }
                        
                        // Helper to get literal value or URI
                        const getValue = (term: N3.Term | null): string => {
                          if (!term) return '';
                          if (term.termType === 'Literal') {
                            return term.value;
                          }
                          if (term.termType === 'NamedNode') {
                            return term.value;
                          }
                          return term.value;
                        };
                        
                        // Extract Dublin Core metadata from RDF triples
                        const dcNamespace = 'http://purl.org/dc/elements/1.1/';
                        const foafNamespace = 'http://xmlns.com/foaf/0.1/';
                        
                        const dublinCore: any = {};
                        const creatorNodes = new Set<string>();
                        
                        // First pass: collect all predicates
                        for (const quad of quads) {
                          const predicate = quad.predicate.value;
                          
                          if (predicate === dcNamespace + 'title') {
                            dublinCore.title = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'creator') {
                            // Creator might be a URI reference to another node
                            if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
                              creatorNodes.add(quad.object.value);
                            } else {
                              dublinCore.creator = getValue(quad.object);
                            }
                          } else if (predicate === dcNamespace + 'date') {
                            dublinCore.date = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'description') {
                            dublinCore.description = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'coverage') {
                            dublinCore.coverage = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'rights') {
                            dublinCore.rights = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'identifier') {
                            dublinCore.identifier = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'subject') {
                            dublinCore.subject = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'type') {
                            dublinCore.type = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'language') {
                            dublinCore.language = getValue(quad.object);
                          } else if (predicate === dcNamespace + 'source') {
                            dublinCore.source = getValue(quad.object);
                          }
                        }
                        
                        // Second pass: resolve creator names from foaf:name
                        if (creatorNodes.size > 0 && !dublinCore.creator) {
                          for (const quad of quads) {
                            if (creatorNodes.has(quad.subject.value) && quad.predicate.value === foafNamespace + 'name') {
                              dublinCore.creator = getValue(quad.object);
                              break;
                            }
                          }
                        }

                        // Create or update HDT metadata via backend
                        const sessionId = localStorage.getItem('oauth_session_id');
                        const hdtPayload = {
                          dublinCore,
                          cidocCrm: {},
                          gettyAAT: {},
                          digitalAssets: [],
                          scenes: []
                        };

                        // Check if HDT exists
                        const checkRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                        });

                        let response;
                        if (checkRes.status === 404) {
                          // Create new HDT
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

                        if (!response.ok) {
                          const errText = await response.text();
                          let errData;
                          try {
                            errData = JSON.parse(errText);
                          } catch {
                            errData = { error: errText };
                          }
                          throw new Error(errData.error || `HTTP ${response.status}: ${errText}`);
                        }

                        const result = await response.json();

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
                  <div className="form-text">Supported: JSON-LD, Turtle, RDF/XML, N-Triples</div>
                </div>
                <div className="alert alert-info">
                  Upload an RDF file to import Dublin Core metadata. All fields will be saved to the HDT metadata document.
                </div>
              </div>
            )}

            {/* SPARQL Endpoint Tab */}
            {importMode === 'sparql' && (
              <div>
                <div className="mb-3">
                  <label htmlFor="sparqlEndpoint" className="form-label">API Endpoint URL</label>
                  <input
                    type="url"
                    id="sparqlEndpoint"
                    className="form-control"
                    placeholder="https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query"
                    value={sparqlEndpoint}
                    onChange={(e) => setSparqlEndpoint(e.target.value)}
                  />
                  <div className="form-text">
                    Default: https://demos.isl.ics.forth.gr/echoes-kb-manager-api/repository/query
                  </div>
                </div>
                <div className="mb-3">
                  <label htmlFor="sparqlQuery" className="form-label">Query Payload (JSON)</label>
                  <textarea
                    id="sparqlQuery"
                    className="form-control font-monospace"
                    rows={12}
                    placeholder={`{\n  "query": "PREFIX htdo: <http://heritage-digital-twin-ontology/> PREFIX void: <http://rdfs.org/ns/void#> SELECT distinct ?s ?p ?o { graph ?ng { values ?dt {<https://demo/HeritageDigitalTwin/CNR/OCRADEMO_12345>} ?dt a void:Dataset; void:subset ?ng . ?s ?p ?o} }",\n  "tripleStoreIds": [\n    "69088495d17ed4f51ab8f6a8",\n    "69088509d17ed4f51ab8f6a9",\n    "690885c3d17ed4f51ab8f6aa"\n  ],\n  "executorTripleStoreId": "68fa3ad9f20fe43d497686b3"\n}`}
                    value={sparqlQuery}
                    onChange={(e) => setSparqlQuery(e.target.value)}
                  />
                  <div className="form-text">
                    JSON object with query, tripleStoreIds, and executorTripleStoreId fields
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      setSparqlLoading(true);
                      
                      // Use default values if fields are empty
                      const endpoint = sparqlEndpoint.trim() || DEFAULT_ECHOES_ENDPOINT;
                      const payload = sparqlQuery.trim() || DEFAULT_ECHOES_QUERY;
                      
                      // EXPERIMENTAL: Use isolated SPARQL import function
                      const { dublinCore, quadCount } = await importFromSparqlEndpoint(
                        endpoint,
                        payload
                      );

                      // Save to backend
                      const sessionId = localStorage.getItem('oauth_session_id');
                      const hdtPayload = { 
                        dublinCore, 
                        cidocCrm: {}, 
                        gettyAAT: {}, 
                        digitalAssets: [], 
                        scenes: [] 
                      };
                      
                      const checkRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, { 
                        credentials: 'include' 
                      });
                      
                      const method = checkRes.status === 404 ? 'POST' : 'PUT';
                      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
                        method,
                        credentials: 'include',
                        headers: { 
                          'Authorization': `Bearer ${sessionId}`, 
                          'Content-Type': 'application/json' 
                        },
                        body: JSON.stringify(hdtPayload)
                      });

                      if (!response.ok) {
                        throw new Error(`Failed to save: HTTP ${response.status}`);
                      }

                      setShowImportModal(false);
                      setHasHdt(true);
                      
                      if (dublinCore.title) {
                        setName(dublinCore.title);
                      }
                      
                      alert(`✅ Successfully imported ${quadCount} RDF triples from SPARQL endpoint!\n\nDublin Core metadata has been saved.`);
                    } catch (err: any) {
                      console.error('SPARQL import error:', err);
                      alert('Error importing from SPARQL: ' + (err?.message || String(err)));
                    } finally {
                      setSparqlLoading(false);
                    }
                  }}
                  disabled={sparqlLoading}
                >
                  {sparqlLoading ? '⏳ Loading...' : '🔍 Query & Import'}
                </button>
                <div className="alert alert-info mt-3 small">
                  <strong>Echoes KB Manager API:</strong> Provide the query endpoint URL and a JSON payload with your SPARQL query, tripleStoreIds, and executorTripleStoreId. Results must be SPARQL JSON format.
                </div>
              </div>
            )}
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