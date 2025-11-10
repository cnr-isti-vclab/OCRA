import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';

/**
 * HDT (Heritage Digital Twin) Management Page
 *
 * This page allows project managers to manage HDT metadata for their projects.
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

interface DublinCoreMetadata {
  title?: string;
  creator?: string[];
  subject?: string[];
  description?: string;
  publisher?: string[];
  contributor?: string[];
  date?: string;
  type?: string[];
  format?: string[];
  identifier?: string[];
  source?: string;
  language?: string[];
  relation?: string[];
  coverage?: string;
  rights?: string;
}

interface CidocCrmMetadata {
  objectType?: string;
  temporalCoverage?: {
    timeSpanBegin?: string;
    timeSpanEnd?: string;
    period?: string;
    century?: string;
  };
  spatialCoverage?: {
    placeName?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
      elevation?: number;
    };
    geonames?: string;
  };
  material?: string[];
  technique?: string[];
  condition?: string;
  conservationHistory?: string;
  culturalContext?: string[];
  styleOrPeriod?: string[];
}

interface GettyAATTerms {
  materials?: Array<{
    term: string;
    aatId: string;
    uri: string;
  }>;
  techniques?: Array<{
    term: string;
    aatId: string;
    uri: string;
  }>;
  objectTypes?: Array<{
    term: string;
    aatId: string;
    uri: string;
  }>;
}

interface HDTModel {
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
}

interface HDTMetadata {
  _id?: string;
  projectId: string;
  dublinCore: DublinCoreMetadata;
  cidocCrm: CidocCrmMetadata;
  gettyAAT: GettyAATTerms;
  hdtModel?: HDTModel;
  customMetadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export default function HDTPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [metadata, setMetadata] = useState<HDTMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dublin-core' | 'model' | 'cidoc-crm'>('dublin-core');

  // 3D Model state
  const [projectFiles, setProjectFiles] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<HDTModel | null>(null);

  // Form state for Dublin Core
  const [dcTitle, setDcTitle] = useState('');
  const [dcDescription, setDcDescription] = useState('');
  const [dcCreator, setDcCreator] = useState('');
  const [dcSubject, setDcSubject] = useState('');
  const [dcDate, setDcDate] = useState('');
  const [dcType, setDcType] = useState('');
  const [dcLanguage, setDcLanguage] = useState('');
  const [dcCoverage, setDcCoverage] = useState('');
  const [dcRights, setDcRights] = useState('');
  const [dcSource, setDcSource] = useState('');

  // Form state for CIDOC-CRM
  const [objectType, setObjectType] = useState('');
  const [timeSpanBegin, setTimeSpanBegin] = useState('');
  const [timeSpanEnd, setTimeSpanEnd] = useState('');
  const [period, setPeriod] = useState('');
  const [century, setCentury] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [material, setMaterial] = useState('');
  const [technique, setTechnique] = useState('');
  const [condition, setCondition] = useState('');
  const [culturalContext, setCulturalContext] = useState('');
  const [styleOrPeriod, setStyleOrPeriod] = useState('');

  useEffect(() => {
    fetchProjectAndMetadata();
  }, [projectId]);

  const fetchProjectAndMetadata = async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch project details
      const projectResponse = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!projectResponse.ok) {
        throw new Error(`Failed to fetch project: ${projectResponse.status}`);
      }

      const projectData = await projectResponse.json();
      setProject(projectData);

      // Fetch project files for 3D model selection
      try {
        const filesRes = await fetch(`${getApiBase()}/api/projects/${projectId}/files`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (filesRes.ok) {
          const filesJson = await filesRes.json();
          setProjectFiles(filesJson.files || []);
        }
      } catch (e) {
        console.warn('Could not fetch project files:', e);
      }

      // Fetch HDT metadata (might not exist yet)
      try {
        const metadataResponse = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json();
          setMetadata(metadataData);
          populateFormFromMetadata(metadataData);
          if (metadataData?.hdtModel) {
            setSelectedModel(metadataData.hdtModel);
          }
        } else if (metadataResponse.status === 404) {
          // No metadata yet - that's okay, we'll initialize it
          console.log('No HDT metadata found, will create on first save');
        } else {
          throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
        }
      } catch (metaError: any) {
        console.warn('Could not fetch metadata:', metaError);
        // Not a critical error, user can create new metadata
      }
    } catch (e: any) {
      console.error('Failed to fetch project:', e);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const populateFormFromMetadata = (meta: HDTMetadata) => {
    // Dublin Core
    if (meta.dublinCore) {
      setDcTitle(meta.dublinCore.title || '');
      setDcDescription(meta.dublinCore.description || '');
      setDcCreator((meta.dublinCore.creator || []).join(', '));
      setDcSubject((meta.dublinCore.subject || []).join(', '));
      setDcDate(meta.dublinCore.date || '');
      setDcType((meta.dublinCore.type || []).join(', '));
      setDcLanguage((meta.dublinCore.language || []).join(', '));
      setDcCoverage(meta.dublinCore.coverage || '');
      setDcRights(meta.dublinCore.rights || '');
      setDcSource(meta.dublinCore.source || '');
    }

    // CIDOC-CRM
    if (meta.cidocCrm) {
      setObjectType(meta.cidocCrm.objectType || '');
      setTimeSpanBegin(meta.cidocCrm.temporalCoverage?.timeSpanBegin || '');
      setTimeSpanEnd(meta.cidocCrm.temporalCoverage?.timeSpanEnd || '');
      setPeriod(meta.cidocCrm.temporalCoverage?.period || '');
      setCentury(meta.cidocCrm.temporalCoverage?.century || '');
      setPlaceName(meta.cidocCrm.spatialCoverage?.placeName || '');
      setLatitude(meta.cidocCrm.spatialCoverage?.coordinates?.latitude?.toString() || '');
      setLongitude(meta.cidocCrm.spatialCoverage?.coordinates?.longitude?.toString() || '');
      setMaterial((meta.cidocCrm.material || []).join(', '));
      setTechnique((meta.cidocCrm.technique || []).join(', '));
      setCondition(meta.cidocCrm.condition || '');
      setCulturalContext((meta.cidocCrm.culturalContext || []).join(', '));
      setStyleOrPeriod((meta.cidocCrm.styleOrPeriod || []).join(', '));
    }
  };

  const handleSave = async () => {
    if (!projectId) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Build metadata object from form
      const metadataPayload: Partial<HDTMetadata> = {
        dublinCore: {
          title: dcTitle || undefined,
          description: dcDescription || undefined,
          creator: dcCreator ? dcCreator.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          subject: dcSubject ? dcSubject.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          date: dcDate || undefined,
          type: dcType ? dcType.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          language: dcLanguage ? dcLanguage.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          coverage: dcCoverage || undefined,
          rights: dcRights || undefined,
          source: dcSource || undefined,
        },
        cidocCrm: {
          objectType: objectType || undefined,
          temporalCoverage: {
            timeSpanBegin: timeSpanBegin || undefined,
            timeSpanEnd: timeSpanEnd || undefined,
            period: period || undefined,
            century: century || undefined,
          },
          spatialCoverage: {
            placeName: placeName || undefined,
            coordinates: (latitude && longitude) ? {
              latitude: parseFloat(latitude),
              longitude: parseFloat(longitude),
            } : undefined,
          },
          material: material ? material.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          technique: technique ? technique.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          condition: condition || undefined,
          culturalContext: culturalContext ? culturalContext.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          styleOrPeriod: styleOrPeriod ? styleOrPeriod.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        },
        gettyAAT: {},
        hdtModel: selectedModel || undefined,
      };

      // Check if metadata exists - if not, create it
      if (!metadata) {
        // POST to create
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadataPayload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create metadata');
        }

        const newMetadata = await response.json();
        setMetadata(newMetadata);
        setSuccessMessage('HDT metadata created successfully!');
      } else {
        // PUT to update
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metadataPayload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update metadata');
        }

        const updatedMetadata = await response.json();
        setMetadata(updatedMetadata);
        setSuccessMessage('HDT metadata updated successfully!');
      }

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      console.error('Failed to save metadata:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted mt-3">Loading HDT management...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger mb-3">
          <h3 className="h5">Error Loading HDT Management</h3>
          <p className="mb-3">{error}</p>
          <Link to="/projects" className="btn btn-primary">Back to Projects</Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning mb-3">
          <h3 className="h5">Project Not Found</h3>
          <p className="mb-3">The requested project could not be found.</p>
          <Link to="/projects" className="btn btn-primary">Back to Projects</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex align-items-center mb-4">
        <Link to={`/projects/${projectId}`} className="btn btn-outline-secondary me-3">
          ← Back to Project
        </Link>
        <div className="flex-grow-1">
          <h1 className="h3 mb-0">🏛️ HDT Metadata</h1>
          <p className="text-muted mb-0">Heritage Digital Twin metadata for: <strong>{project.name}</strong></p>
        </div>
        <Link 
          to={`/api/projects/${projectId}/export/rdf`} 
          className="btn btn-outline-primary"
          target="_blank"
        >
          📥 Download RDF
        </Link>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <strong>✓</strong> {successMessage}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setSuccessMessage(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <strong>Error:</strong> {error}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Tabs */}
      <div className="card">
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'dublin-core' ? 'active' : ''}`}
                onClick={() => setActiveTab('dublin-core')}
                type="button"
              >
                📚 Dublin Core
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'model' ? 'active' : ''}`}
                onClick={() => setActiveTab('model')}
                type="button"
              >
                🧩 3D Model
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'cidoc-crm' ? 'active' : ''}`}
                onClick={() => setActiveTab('cidoc-crm')}
                type="button"
              >
                🏛️ CIDOC-CRM
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body">
          {/* Dublin Core Tab */}
          {activeTab === 'dublin-core' && (
            <div>
              <h5 className="mb-3">Dublin Core Metadata</h5>
              <p className="text-muted small mb-4">
                Basic descriptive metadata using Dublin Core standard (ISO 15836).
              </p>

              <div className="mb-3">
                <label htmlFor="dc-title" className="form-label">Title</label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-title"
                  value={dcTitle}
                  onChange={(e) => setDcTitle(e.target.value)}
                  placeholder="Heritage Digital Twin title"
                />
                <small className="form-text text-muted">dc:title</small>
              </div>

              <div className="mb-3">
                <label htmlFor="dc-description" className="form-label">Description</label>
                <textarea
                  className="form-control"
                  id="dc-description"
                  rows={4}
                  value={dcDescription}
                  onChange={(e) => setDcDescription(e.target.value)}
                  placeholder="Detailed description of the heritage object"
                ></textarea>
                <small className="form-text text-muted">dc:description</small>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-creator" className="form-label">Creator(s)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-creator"
                    value={dcCreator}
                    onChange={(e) => setDcCreator(e.target.value)}
                    placeholder="Artist, sculptor, architect (comma-separated)"
                  />
                  <small className="form-text text-muted">dc:creator (comma-separated)</small>
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-date" className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-control"
                    id="dc-date"
                    value={dcDate}
                    onChange={(e) => setDcDate(e.target.value)}
                  />
                  <small className="form-text text-muted">dc:date (ISO 8601)</small>
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="dc-subject" className="form-label">Subject / Keywords</label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-subject"
                  value={dcSubject}
                  onChange={(e) => setDcSubject(e.target.value)}
                  placeholder="sculpture, renaissance, marble, religious art (comma-separated)"
                />
                <small className="form-text text-muted">dc:subject (comma-separated keywords)</small>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-type" className="form-label">Type(s)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-type"
                    value={dcType}
                    onChange={(e) => setDcType(e.target.value)}
                    placeholder="3D Model, Sculpture, Artifact (comma-separated)"
                  />
                  <small className="form-text text-muted">dc:type (comma-separated)</small>
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-language" className="form-label">Language(s)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-language"
                    value={dcLanguage}
                    onChange={(e) => setDcLanguage(e.target.value)}
                    placeholder="en, it, la (comma-separated ISO 639 codes)"
                  />
                  <small className="form-text text-muted">dc:language (ISO 639 codes)</small>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-coverage" className="form-label">Coverage</label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-coverage"
                    value={dcCoverage}
                    onChange={(e) => setDcCoverage(e.target.value)}
                    placeholder="Spatial or temporal coverage"
                  />
                  <small className="form-text text-muted">dc:coverage</small>
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-source" className="form-label">Source</label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-source"
                    value={dcSource}
                    onChange={(e) => setDcSource(e.target.value)}
                    placeholder="Original source or reference"
                  />
                  <small className="form-text text-muted">dc:source</small>
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="dc-rights" className="form-label">Rights Statement</label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-rights"
                  value={dcRights}
                  onChange={(e) => setDcRights(e.target.value)}
                  placeholder="Copyright statement or rights information"
                />
                <small className="form-text text-muted">dc:rights</small>
              </div>
            </div>
          )}

          {/* 3D Model Tab */}
          {activeTab === 'model' && (
            <div>
              <h5 className="mb-3">3D Model for Viewer</h5>
              <p className="text-muted small mb-4">
                Upload or select a 3D model to represent this Heritage Digital Twin in the viewer. Recommended format: GLB/GLTF.
              </p>

              {/* Current selection */}
              <div className="mb-4">
                <h6 className="text-primary mb-2">Current selection</h6>
                {selectedModel ? (
                  <div className="d-flex align-items-center gap-3 p-3 border rounded">
                    <div className="text-muted">📦</div>
                    <div>
                      <div><strong>{selectedModel.fileName}</strong></div>
                      {selectedModel.fileSize && (
                        <div className="text-muted small">{(selectedModel.fileSize / (1024*1024)).toFixed(2)} MB</div>
                      )}
                      {selectedModel.fileUrl && (
                        <div>
                          <a href={selectedModel.fileUrl} target="_blank" rel="noreferrer">Download</a>
                        </div>
                      )}
                    </div>
                    <button className="btn btn-sm btn-outline-danger ms-auto" onClick={() => setSelectedModel(null)}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-muted">No model selected yet.</div>
                )}
              </div>

              {/* Upload new model */}
              <div className="mb-4">
                <h6 className="text-primary mb-2">Upload new model</h6>
                <input
                  type="file"
                  className="form-control"
                  accept=".glb,.gltf,.ply,.obj,.fbx"
                  onChange={async (e) => {
                    if (!projectId) return;
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setUploading(true);
                      // Upload file
                      const formData = new FormData();
                      formData.append('file', file);
                      const uploadRes = await fetch(`${getApiBase()}/api/projects/${projectId}/files`, {
                        method: 'POST',
                        credentials: 'include',
                        body: formData,
                      });
                      if (!uploadRes.ok) {
                        const err = await uploadRes.json().catch(() => ({}));
                        throw new Error(err.error || 'Upload failed');
                      }
                      // Set as selected model
                      const fileUrl = `${getApiBase()}/api/projects/${projectId}/files/${encodeURIComponent(file.name)}`;
                      const model: HDTModel = {
                        fileName: file.name,
                        fileUrl,
                        fileSize: file.size,
                        mimeType: file.type || 'application/octet-stream',
                        uploadedAt: new Date().toISOString(),
                      };
                      setSelectedModel(model);
                      // Refresh project files list
                      await fetchProjectAndMetadata();
                      setSuccessMessage('Model uploaded. Remember to Save Metadata to apply.');
                    } catch (err: any) {
                      setError(err?.message || 'Failed to upload model');
                    } finally {
                      setUploading(false);
                      // Clear input value to allow re-uploading same file if needed
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  disabled={uploading}
                />
                {uploading && (
                  <div className="text-muted small mt-2">Uploading...</div>
                )}
              </div>

              {/* Select existing file */}
              <div>
                <h6 className="text-primary mb-2">Select from existing files</h6>
                {projectFiles.length === 0 ? (
                  <div className="text-muted">No files found in this project.</div>
                ) : (
                  <div className="list-group">
                    {projectFiles.map(f => (
                      <div key={f.name} className="list-group-item d-flex align-items-center">
                        <div className="me-3">📄</div>
                        <div className="flex-grow-1">
                          <div><strong>{f.name}</strong></div>
                          <div className="text-muted small">{(f.size / (1024*1024)).toFixed(2)} MB</div>
                        </div>
                        <button className="btn btn-sm btn-outline-primary" onClick={() => {
                          const model: HDTModel = {
                            fileName: f.name,
                            fileUrl: f.url.startsWith('http') ? f.url : `${getApiBase()}${f.url}`,
                            fileSize: f.size,
                            uploadedAt: new Date().toISOString(),
                          };
                          setSelectedModel(model);
                          setSuccessMessage('Model selected. Remember to Save Metadata to apply.');
                        }}>
                          Use as HDT Model
                        </button>
                        <a className="btn btn-sm btn-outline-secondary ms-2" href={f.url.startsWith('http') ? f.url : `${getApiBase()}${f.url}`} target="_blank" rel="noreferrer">Download</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CIDOC-CRM Tab */}
          {activeTab === 'cidoc-crm' && (
            <div>
              <h5 className="mb-3">CIDOC-CRM Cultural Heritage Properties</h5>
              <p className="text-muted small mb-4">
                Structured metadata for cultural heritage objects using CIDOC Conceptual Reference Model.
              </p>

              <div className="mb-4">
                <h6 className="text-primary">Object Information</h6>
                <div className="mb-3">
                  <label htmlFor="object-type" className="form-label">Object Type</label>
                  <input
                    type="text"
                    className="form-control"
                    id="object-type"
                    value={objectType}
                    onChange={(e) => setObjectType(e.target.value)}
                    placeholder="e.g., Sculpture, Painting, Artifact"
                  />
                  <small className="form-text text-muted">crm:E73_Information_Object type</small>
                </div>
              </div>

              <div className="mb-4">
                <h6 className="text-primary">Temporal Coverage</h6>
                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="time-begin" className="form-label">Time Span Begin</label>
                    <input
                      type="date"
                      className="form-control"
                      id="time-begin"
                      value={timeSpanBegin}
                      onChange={(e) => setTimeSpanBegin(e.target.value)}
                    />
                    <small className="form-text text-muted">crm:P82a_begin_of_the_begin</small>
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="time-end" className="form-label">Time Span End</label>
                    <input
                      type="date"
                      className="form-control"
                      id="time-end"
                      value={timeSpanEnd}
                      onChange={(e) => setTimeSpanEnd(e.target.value)}
                    />
                    <small className="form-text text-muted">crm:P82b_end_of_the_end</small>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="period" className="form-label">Period</label>
                    <input
                      type="text"
                      className="form-control"
                      id="period"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      placeholder="e.g., Renaissance, Baroque, Medieval"
                    />
                    <small className="form-text text-muted">Named historical period</small>
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="century" className="form-label">Century</label>
                    <input
                      type="text"
                      className="form-control"
                      id="century"
                      value={century}
                      onChange={(e) => setCentury(e.target.value)}
                      placeholder="e.g., 16th century, 1500s"
                    />
                    <small className="form-text text-muted">Century reference</small>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h6 className="text-primary">Spatial Coverage</h6>
                <div className="mb-3">
                  <label htmlFor="place-name" className="form-label">Place Name</label>
                  <input
                    type="text"
                    className="form-control"
                    id="place-name"
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    placeholder="e.g., Florence, Vatican City, Louvre Museum"
                  />
                  <small className="form-text text-muted">dcterms:spatial</small>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label htmlFor="latitude" className="form-label">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      id="latitude"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="e.g., 43.7731"
                    />
                    <small className="form-text text-muted">WGS84 decimal degrees</small>
                  </div>

                  <div className="col-md-6 mb-3">
                    <label htmlFor="longitude" className="form-label">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      id="longitude"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="e.g., 11.2560"
                    />
                    <small className="form-text text-muted">WGS84 decimal degrees</small>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h6 className="text-primary">Materials & Techniques</h6>
                <div className="mb-3">
                  <label htmlFor="material" className="form-label">Material(s)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="material"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="marble, bronze, wood, limestone (comma-separated)"
                  />
                  <small className="form-text text-muted">crm:P45_consists_of (comma-separated)</small>
                </div>

                <div className="mb-3">
                  <label htmlFor="technique" className="form-label">Technique(s)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="technique"
                    value={technique}
                    onChange={(e) => setTechnique(e.target.value)}
                    placeholder="carving, casting, painting, photogrammetry (comma-separated)"
                  />
                  <small className="form-text text-muted">crm:P32_used_general_technique (comma-separated)</small>
                </div>
              </div>

              <div className="mb-4">
                <h6 className="text-primary">Condition & Context</h6>
                <div className="mb-3">
                  <label htmlFor="condition" className="form-label">Condition</label>
                  <input
                    type="text"
                    className="form-control"
                    id="condition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    placeholder="e.g., Good, Fair, Restored, Fragmented"
                  />
                  <small className="form-text text-muted">Current condition state</small>
                </div>

                <div className="mb-3">
                  <label htmlFor="cultural-context" className="form-label">Cultural Context</label>
                  <input
                    type="text"
                    className="form-control"
                    id="cultural-context"
                    value={culturalContext}
                    onChange={(e) => setCulturalContext(e.target.value)}
                    placeholder="Roman, Greek, Byzantine (comma-separated)"
                  />
                  <small className="form-text text-muted">Cultural affiliations (comma-separated)</small>
                </div>

                <div className="mb-3">
                  <label htmlFor="style-period" className="form-label">Style or Period</label>
                  <input
                    type="text"
                    className="form-control"
                    id="style-period"
                    value={styleOrPeriod}
                    onChange={(e) => setStyleOrPeriod(e.target.value)}
                    placeholder="Gothic, Neoclassical, Art Deco (comma-separated)"
                  />
                  <small className="form-text text-muted">Art historical style/period (comma-separated)</small>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Save Button */}
        <div className="card-footer d-flex justify-content-between align-items-center">
          <div className="text-muted small">
            {metadata ? (
              <>Last updated: {new Date(metadata.updatedAt!).toLocaleString()}</>
            ) : (
              <>No metadata saved yet</>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Saving...
              </>
            ) : (
              <>💾 Save Metadata</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}