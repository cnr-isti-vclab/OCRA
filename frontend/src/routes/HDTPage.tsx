import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState, useRef, useCallback } from 'react';
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
  digitalAssets?: Array<any>;  // New: Digital Assets pool
  scenes?: Array<any>;         // New: Scene configurations
  hdtModel?: HDTModel;         // Legacy: Single model (for backward compatibility)
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
  const [activeTab, setActiveTab] = useState<'dublin-core' | 'assets' | 'scenes' | 'cidoc-crm'>('dublin-core');

  // Digital Assets state
  const [digitalAssets, setDigitalAssets] = useState<Array<any>>([]);
  const [projectFiles, setProjectFiles] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Scenes state
  const [scenes, setScenes] = useState<Array<any>>([]);
  const [editingScene, setEditingScene] = useState<any | null>(null);
  const [showSceneEditor, setShowSceneEditor] = useState(false);

  // Legacy 3D Model state (for backward compatibility during migration)
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadRef = useRef(true); // Track if this is the first load

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
          
          // Load digital assets (new architecture)
          if (metadataData?.digitalAssets && Array.isArray(metadataData.digitalAssets)) {
            setDigitalAssets(metadataData.digitalAssets);
          }
          
          // Load scenes (new architecture)
          if (metadataData?.scenes && Array.isArray(metadataData.scenes)) {
            setScenes(metadataData.scenes);
          }
          
          // Backward compatibility: if hdtModel exists but no digitalAssets, migrate it
          if (metadataData?.hdtModel && (!metadataData.digitalAssets || metadataData.digitalAssets.length === 0)) {
            const legacyAsset = {
              id: `asset_legacy_${Date.now()}`,
              type: 'model3d',
              fileName: metadataData.hdtModel.fileName,
              fileUrl: metadataData.hdtModel.fileUrl,
              fileSize: metadataData.hdtModel.fileSize,
              mimeType: metadataData.hdtModel.mimeType,
              uploadedAt: metadataData.hdtModel.uploadedAt,
            };
            setDigitalAssets([legacyAsset]);
            setSelectedModel(metadataData.hdtModel); // Keep for now
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
      // Delay enabling auto-save to ensure all state updates have completed
      setTimeout(() => {
        setDataLoaded(true);
        initialLoadRef.current = false;
      }, 100);
    }
  };

  const populateFormFromMetadata = (meta: HDTMetadata) => {
    // Handle both direct and nested metadata structures
    const dublinCore = (meta as any).metadata?.dublinCore || meta.dublinCore;
    const cidocCrm = (meta as any).metadata?.cidocCrm || meta.cidocCrm;
    
    // Dublin Core
    if (dublinCore) {
      setDcTitle(dublinCore.title || '');
      setDcDescription(dublinCore.description || '');
      // Handle creator as either string or array
      if (Array.isArray(dublinCore.creator)) {
        setDcCreator(dublinCore.creator.join(', '));
      } else if (typeof dublinCore.creator === 'string') {
        setDcCreator(dublinCore.creator);
      } else {
        setDcCreator('');
      }
      // Handle subject as either string or array
      if (Array.isArray(dublinCore.subject)) {
        setDcSubject(dublinCore.subject.join(', '));
      } else if (typeof dublinCore.subject === 'string') {
        setDcSubject(dublinCore.subject);
      } else {
        setDcSubject('');
      }
      setDcDate(dublinCore.date || '');
      // Handle type as either string or array
      if (Array.isArray(dublinCore.type)) {
        setDcType(dublinCore.type.join(', '));
      } else if (typeof dublinCore.type === 'string') {
        setDcType(dublinCore.type);
      } else {
        setDcType('');
      }
      // Handle language as either string or array
      if (Array.isArray(dublinCore.language)) {
        setDcLanguage(dublinCore.language.join(', '));
      } else if (typeof dublinCore.language === 'string') {
        setDcLanguage(dublinCore.language);
      } else {
        setDcLanguage('');
      }
      setDcCoverage(dublinCore.coverage || '');
      setDcRights(dublinCore.rights || '');
      setDcSource(dublinCore.source || '');
    }

    // CIDOC-CRM
    if (cidocCrm) {
      setObjectType(cidocCrm.objectType || '');
      setTimeSpanBegin(cidocCrm.temporalCoverage?.timeSpanBegin || '');
      setTimeSpanEnd(cidocCrm.temporalCoverage?.timeSpanEnd || '');
      setPeriod(cidocCrm.temporalCoverage?.period || '');
      setCentury(cidocCrm.temporalCoverage?.century || '');
      setPlaceName(cidocCrm.spatialCoverage?.placeName || '');
      setLatitude(cidocCrm.spatialCoverage?.coordinates?.latitude?.toString() || '');
      setLongitude(cidocCrm.spatialCoverage?.coordinates?.longitude?.toString() || '');
      setMaterial((cidocCrm.material || []).join(', '));
      setTechnique((cidocCrm.technique || []).join(', '));
      setCondition(cidocCrm.condition || '');
      setCulturalContext((cidocCrm.culturalContext || []).join(', '));
      setStyleOrPeriod((cidocCrm.styleOrPeriod || []).join(', '));
    }
  };

  // Manual save function (called by Save button)
  const handleManualSave = async () => {
    await autoSaveMetadata();
    // Show success message
    setSuccessMessage('✅ Metadata saved successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Auto-save metadata function
  const autoSaveMetadata = useCallback(async () => {
    if (!projectId) return;

    try {
      setSaving(true);
      setError(null);

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
        // New: Digital Assets
        digitalAssets: digitalAssets.length > 0 ? digitalAssets : undefined,
        // New: Scenes
        scenes: scenes.length > 0 ? scenes : undefined,
        // Legacy: Keep hdtModel for backward compatibility
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
      }
    } catch (e: any) {
      console.error('Failed to save metadata:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [projectId, dcTitle, dcDescription, dcCreator, dcSubject, dcDate, dcType, dcLanguage, 
      dcCoverage, dcRights, dcSource, objectType, timeSpanBegin, timeSpanEnd, period, century, 
      placeName, latitude, longitude, material, technique, condition, culturalContext, styleOrPeriod,
      digitalAssets, scenes, selectedModel]);

  // Auto-save disabled - users must manually save their changes
  // const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 
  // useEffect(() => {
  //   // Don't auto-save on initial load (when metadata is being populated from server)
  //   if (loading || !dataLoaded || initialLoadRef.current) return;
  //   
  //   // Clear previous timeout
  //   if (saveTimeoutRef.current) {
  //     clearTimeout(saveTimeoutRef.current);
  //   }
  //
  //   // Set new timeout for auto-save (debounce for 1 second)
  //   saveTimeoutRef.current = setTimeout(() => {
  //     autoSaveMetadata();
  //   }, 1000);
  //
  //   // Cleanup
  //   return () => {
  //     if (saveTimeoutRef.current) {
  //       clearTimeout(saveTimeoutRef.current);
  //     }
  //   };
  // }, [dcTitle, dcDescription, dcCreator, dcSubject, dcDate, dcType, dcLanguage, 
  //     dcCoverage, dcRights, dcSource, objectType, timeSpanBegin, timeSpanEnd, period, century, 
  //     placeName, latitude, longitude, material, technique, condition, culturalContext, styleOrPeriod,
  //     loading, dataLoaded, autoSaveMetadata]);

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
        <div className="flex-grow-1">
          <h1 className="h3 mb-0">🏛️ HDT Metadata</h1>
        </div>
        <div className="d-flex gap-2">
          <a 
            href={`${getApiBase()}/api/projects/${projectId}/export/rdf`} 
            className="btn btn-outline-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            📥 Download RDF
          </a>
        </div>
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
                HC1 Heritage Entity
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'assets' ? 'active' : ''}`}
                onClick={() => setActiveTab('assets')}
                type="button"
              >
                Digital Asset - HC2 Heritage Digital Twin
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'scenes' ? 'active' : ''}`}
                onClick={() => setActiveTab('scenes')}
                type="button"
              >
                🎬 Scenes
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
              <h5 className="mb-3">HC1 Heritage Entity</h5>
              <p className="text-muted small mb-4">
                Basic descriptive metadata about the heritage entity using Dublin Core standard (ISO 15836).
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
                    type="text"
                    className="form-control"
                    id="dc-date"
                    value={dcDate}
                    onChange={(e) => setDcDate(e.target.value)}
                    placeholder="e.g., 1924, 1924-05, 1924-05-15"
                  />
                  <small className="form-text text-muted">dc:date (flexible format: year, year-month, or ISO 8601 date)</small>
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

              {/* Save Button for Dublin Core */}
              <div className="d-flex gap-2 mt-4">
                <button
                  onClick={handleManualSave}
                  disabled={saving}
                  className="btn btn-success"
                >
                  {saving ? '💾 Saving...' : '💾 Save Heritage Entity Metadata'}
                </button>
                {successMessage && (
                  <div className="alert alert-success mb-0 py-2 px-3" role="alert">
                    {successMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Digital Assets Tab */}
          {activeTab === 'assets' && (
            <div>
              <p className="text-muted small mb-4">
                Manage all digital assets for this HC2 Heritage Digital Twin. Assets in the pool can be used across multiple scenes.
              </p>

              {/* Asset Type Filter/Info */}
              <div className="mb-4 p-3 bg-light rounded">
                <h6 className="mb-2">Supported Asset Types</h6>
                <div className="d-flex gap-2 flex-wrap">
                  <span className="badge bg-primary">3D Models (GLB, GLTF, PLY, OBJ, NXS)</span>
                  <span className="badge bg-secondary text-muted">RTI (Coming Soon)</span>
                  <span className="badge bg-secondary text-muted">Images (Coming Soon)</span>
                  <span className="badge bg-secondary text-muted">Videos (Coming Soon)</span>
                </div>
              </div>

              {/* Current Assets List */}
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0">Asset Pool ({digitalAssets.length})</h6>
                </div>
                
                {digitalAssets.length === 0 ? (
                  <div className="alert alert-info">
                    <strong>No assets yet.</strong> Upload or select files below to add them to your asset pool.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>File Name</th>
                          <th>Size</th>
                          <th>Added</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {digitalAssets.map((asset, index) => (
                          <tr key={asset.id || index}>
                            <td>
                              {asset.type === 'model3d' && '3D Model'}
                              {asset.type === 'rti' && 'RTI'}
                              {asset.type === 'image' && 'Image'}
                              {asset.type === 'video' && 'Video'}
                              {asset.type === 'other' && 'Other'}
                            </td>
                            <td>
                              <strong>{asset.fileName}</strong>
                              {asset.fileUrl && (
                                <div>
                                  <a href={asset.fileUrl} target="_blank" rel="noreferrer" className="small text-decoration-none">
                                    Download ↗
                                  </a>
                                </div>
                              )}
                            </td>
                            <td className="text-muted small">
                              {asset.fileSize ? `${(asset.fileSize / (1024*1024)).toFixed(2)} MB` : '-'}
                            </td>
                            <td className="text-muted small">
                              {asset.uploadedAt ? new Date(asset.uploadedAt).toLocaleDateString() : '-'}
                            </td>
                            <td>
                              <button 
                                className="btn btn-sm btn-outline-danger"
                                onClick={async () => {
                                  if (!confirm(`Delete "${asset.fileName}"? This will remove the file from storage and cannot be undone.`)) {
                                    return;
                                  }
                                  
                                  try {
                                    // Delete from MongoDB
                                    const deleteAssetRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/assets/${asset.id}`, {
                                      method: 'DELETE',
                                      credentials: 'include'
                                    });
                                    
                                    if (!deleteAssetRes.ok) {
                                      const err = await deleteAssetRes.json().catch(() => ({}));
                                      throw new Error(err.error || 'Failed to delete asset from database');
                                    }
                                    
                                    // Delete file from volume
                                    const deleteFileRes = await fetch(`${getApiBase()}/api/projects/${projectId}/files/${encodeURIComponent(asset.fileName)}`, {
                                      method: 'DELETE',
                                      credentials: 'include'
                                    });
                                    
                                    if (!deleteFileRes.ok) {
                                      console.warn('Failed to delete file from volume, but asset removed from database');
                                    }
                                    
                                    // Update local state
                                    setDigitalAssets(digitalAssets.filter((_, i) => i !== index));
                                    
                                    // Refresh to sync with server
                                    await fetchProjectAndMetadata();
                                    setSuccessMessage(`✓ Asset "${asset.fileName}" deleted successfully!`);
                                  } catch (err: any) {
                                    setError(err?.message || 'Failed to delete asset');
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Upload New Asset */}
              <div className="mb-4">
                <h6 className="text-primary mb-2">Add a new 3D model</h6>
                <input
                  type="file"
                  id="assetFileInput"
                  className="d-none"
                  accept=".glb,.gltf,.ply,.obj,.fbx,.nxs"
                  onChange={async (e) => {
                    if (!projectId) return;
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setUploading(true);
                      setUploadProgress(0);
                      setError(null);
                      setSuccessMessage(null);
                      
                      // Upload file with progress tracking
                      const formData = new FormData();
                      formData.append('file', file);
                      
                      const uploadRes = await new Promise<Response>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        
                        // Track upload progress
                        xhr.upload.addEventListener('progress', (e) => {
                          if (e.lengthComputable) {
                            const percentComplete = Math.round((e.loaded / e.total) * 100);
                            setUploadProgress(percentComplete);
                          }
                        });
                        
                        xhr.addEventListener('load', () => {
                          if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(new Response(xhr.responseText, {
                              status: xhr.status,
                              statusText: xhr.statusText,
                              headers: new Headers({
                                'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'
                              })
                            }));
                          } else {
                            reject(new Error(`Upload failed with status ${xhr.status}`));
                          }
                        });
                        
                        xhr.addEventListener('error', () => reject(new Error('Network error')));
                        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
                        
                        xhr.open('POST', `${getApiBase()}/api/projects/${projectId}/files`);
                        xhr.withCredentials = true;
                        xhr.send(formData);
                      });
                      
                      if (!uploadRes.ok) {
                        const err = await uploadRes.json().catch(() => ({}));
                        throw new Error(err.error || 'Upload failed');
                      }
                      
                      // Create new asset object
                      const fileUrl = `${getApiBase()}/api/projects/${projectId}/files/${encodeURIComponent(file.name)}`;
                      const newAsset = {
                        id: `asset_${Date.now()}`,
                        type: 'model3d',
                        fileName: file.name,
                        fileUrl,
                        fileSize: file.size,
                        mimeType: file.type || 'application/octet-stream',
                        uploadedAt: new Date().toISOString(),
                      };
                      
                      // Update local state
                      const updatedAssets = [...digitalAssets, newAsset];
                      setDigitalAssets(updatedAssets);
                      
                      // Immediately save to MongoDB
                      const saveRes = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/assets`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newAsset)
                      });
                      
                      if (!saveRes.ok) {
                        const err = await saveRes.json().catch(() => ({}));
                        throw new Error(err.error || 'Failed to save asset to database');
                      }
                      
                      // Refresh to get updated data from server
                      await fetchProjectAndMetadata();
                      setSuccessMessage(`✓ Asset "${file.name}" uploaded and saved successfully!`);
                    } catch (err: any) {
                      setError(err?.message || 'Failed to upload asset');
                    } finally {
                      setUploading(false);
                      setUploadProgress(0);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  disabled={uploading}
                />
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => document.getElementById('assetFileInput')?.click()}
                    disabled={uploading}
                    title="Click to browse and select a 3D model file. Upload will start automatically."
                  >
                    {uploading ? `Uploading... ${uploadProgress}%` : 'Import from a local file'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => {
                      alert('3D IIIF Manifest import feature coming soon!');
                    }}
                    disabled={uploading}
                  >
                    Import from 3D IIIF Manifest
                  </button>
                </div>
                {uploading && uploadProgress > 0 && (
                  <div className="progress mt-2" style={{ height: '20px' }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated"
                      role="progressbar"
                      style={{ width: `${uploadProgress}%` }}
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      {uploadProgress}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scenes Tab */}
          {activeTab === 'scenes' && (
            <div>
              <h5 className="mb-3">Scene Configurations</h5>
              <p className="text-muted small mb-4">
                Create and manage different scene configurations. Each scene can contain multiple assets from your pool with different positions, rotations, and settings.
              </p>

              {/* Scene List */}
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0">Scenes ({scenes.length})</h6>
                  <button 
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const newScene = {
                        id: `scene_${Date.now()}`,
                        name: `Scene ${scenes.length + 1}`,
                        description: '',
                        isDefault: scenes.length === 0, // First scene is default
                        assets: [],
                        environment: {
                          backgroundColor: '#f0f0f0',
                          showGround: true,
                          groundColor: '#808080',
                        },
                      };
                      setEditingScene(newScene);
                      setShowSceneEditor(true);
                    }}
                  >
                    + Create New Scene
                  </button>
                </div>

                {scenes.length === 0 ? (
                  <div className="alert alert-info">
                    <strong>No scenes yet.</strong> Create your first scene to start configuring your Heritage Digital Twin.
                  </div>
                ) : (
                  <div className="row g-3">
                    {scenes.map((scene, index) => (
                      <div key={scene.id || index} className="col-md-6">
                        <div className="card h-100">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <h6 className="card-title mb-0">
                                {scene.name}
                                {scene.isDefault && <span className="badge bg-success ms-2">Default</span>}
                              </h6>
                              <div className="btn-group btn-group-sm">
                                <button 
                                  className="btn btn-outline-primary"
                                  onClick={() => {
                                    setEditingScene(scene);
                                    setShowSceneEditor(true);
                                  }}
                                  title="Edit Scene"
                                >
                                  ✏️
                                </button>
                                <button 
                                  className="btn btn-outline-danger"
                                  onClick={() => {
                                    if (scenes.length === 1) {
                                      alert('Cannot delete the last scene. Projects must have at least one scene.');
                                      return;
                                    }
                                    if (confirm(`Delete scene "${scene.name}"?`)) {
                                      const updatedScenes = scenes.filter((_, i) => i !== index);
                                      // If deleting default scene, make first scene default
                                      if (scene.isDefault && updatedScenes.length > 0) {
                                        updatedScenes[0].isDefault = true;
                                      }
                                      setScenes(updatedScenes);
                                      setSuccessMessage('✓ Scene deleted');
                                    }
                                  }}
                                  title="Delete Scene"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                            {scene.description && (
                              <p className="card-text text-muted small">{scene.description}</p>
                            )}
                            <div className="d-flex gap-3 text-muted small">
                              <span>📦 {scene.assets?.length || 0} asset{(scene.assets?.length || 0) !== 1 ? 's' : ''}</span>
                              {scene.environment?.backgroundColor && (
                                <span>
                                  🎨 <span 
                                    style={{
                                      display: 'inline-block',
                                      width: '12px',
                                      height: '12px',
                                      backgroundColor: scene.environment.backgroundColor,
                                      border: '1px solid #ccc',
                                      borderRadius: '2px',
                                      verticalAlign: 'middle',
                                    }}
                                  ></span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scene Editor Modal/Panel */}
              {showSceneEditor && editingScene && (
                <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div className="modal-dialog modal-lg modal-dialog-scrollable">
                    <div className="modal-content">
                      <div className="modal-header">
                        <h5 className="modal-title">
                          {scenes.find(s => s.id === editingScene.id) ? 'Edit Scene' : 'Create New Scene'}
                        </h5>
                        <button 
                          type="button" 
                          className="btn-close" 
                          onClick={() => {
                            setShowSceneEditor(false);
                            setEditingScene(null);
                          }}
                        ></button>
                      </div>
                      <div className="modal-body">
                        {/* Scene Name */}
                        <div className="mb-3">
                          <label className="form-label">Scene Name *</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editingScene.name}
                            onChange={(e) => setEditingScene({ ...editingScene, name: e.target.value })}
                            placeholder="e.g., Overview, Detail View, Restoration"
                          />
                        </div>

                        {/* Scene Description */}
                        <div className="mb-3">
                          <label className="form-label">Description</label>
                          <textarea
                            className="form-control"
                            rows={2}
                            value={editingScene.description || ''}
                            onChange={(e) => setEditingScene({ ...editingScene, description: e.target.value })}
                            placeholder="Brief description of this scene configuration..."
                          ></textarea>
                        </div>

                        {/* Default Scene Toggle */}
                        <div className="mb-3 form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id="default-scene-check"
                            checked={editingScene.isDefault || false}
                            onChange={(e) => setEditingScene({ ...editingScene, isDefault: e.target.checked })}
                          />
                          <label className="form-check-label" htmlFor="default-scene-check">
                            Set as default scene (shown first to viewers)
                          </label>
                        </div>

                        <hr />

                        {/* Assets in Scene */}
                        <h6 className="mb-3">Assets in Scene</h6>
                        {digitalAssets.length === 0 ? (
                          <div className="alert alert-warning">
                            No digital assets available. Add assets in the <strong>Digital Assets</strong> tab first.
                          </div>
                        ) : (
                          <>
                            <p className="text-muted small">Select which assets to include in this scene:</p>
                            <div className="list-group mb-3">
                              {digitalAssets.map((asset) => {
                                const isInScene = (editingScene.assets || []).some((a: any) => a.assetId === asset.id);
                                return (
                                  <div key={asset.id} className="list-group-item">
                                    <div className="d-flex align-items-center">
                                      <input
                                        type="checkbox"
                                        className="form-check-input me-3"
                                        checked={isInScene}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            // Add asset to scene
                                            // Don't set position - let auto-centering logic in ThreePresenter handle it
                                            const newAssetRef = {
                                              assetId: asset.id,
                                              visible: true,
                                              // position: undefined - let ThreePresenter auto-center
                                              // rotation: undefined - defaults to [0,0,0]
                                              // scale: undefined - defaults to 1
                                            };
                                            setEditingScene({
                                              ...editingScene,
                                              assets: [...(editingScene.assets || []), newAssetRef],
                                            });
                                          } else {
                                            // Remove asset from scene
                                            setEditingScene({
                                              ...editingScene,
                                              assets: (editingScene.assets || []).filter((a: any) => a.assetId !== asset.id),
                                            });
                                          }
                                        }}
                                      />
                                      <div className="flex-grow-1">
                                        <div>
                                          <strong>{asset.fileName}</strong>
                                          <span className="badge bg-secondary ms-2">{asset.type}</span>
                                        </div>
                                        {asset.fileSize && (
                                          <small className="text-muted">
                                            {(asset.fileSize / (1024*1024)).toFixed(2)} MB
                                          </small>
                                        )}
                                      </div>
                                      {isInScene && (
                                        <button
                                          className="btn btn-sm btn-outline-secondary"
                                          onClick={() => {
                                            // TODO: Show transform controls for this asset
                                            alert('Transform controls coming soon! For now, assets use default position (0,0,0).');
                                          }}
                                        >
                                          ⚙️ Transform
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}

                        <hr />

                        {/* Environment Settings */}
                        <h6 className="mb-3">Environment Settings</h6>
                        <div className="row">
                          <div className="col-md-6 mb-3">
                            <label className="form-label">Background Color</label>
                            <input
                              type="color"
                              className="form-control form-control-color"
                              value={editingScene.environment?.backgroundColor || '#f0f0f0'}
                              onChange={(e) => setEditingScene({
                                ...editingScene,
                                environment: {
                                  ...editingScene.environment,
                                  backgroundColor: e.target.value,
                                },
                              })}
                            />
                          </div>
                          <div className="col-md-6 mb-3">
                            <label className="form-label">Ground Color</label>
                            <input
                              type="color"
                              className="form-control form-control-color"
                              value={editingScene.environment?.groundColor || '#808080'}
                              onChange={(e) => setEditingScene({
                                ...editingScene,
                                environment: {
                                  ...editingScene.environment,
                                  groundColor: e.target.value,
                                },
                              })}
                            />
                          </div>
                        </div>
                        <div className="mb-3 form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id="show-ground-check"
                            checked={editingScene.environment?.showGround !== false}
                            onChange={(e) => setEditingScene({
                              ...editingScene,
                              environment: {
                                ...editingScene.environment,
                                showGround: e.target.checked,
                              },
                            })}
                          />
                          <label className="form-check-label" htmlFor="show-ground-check">
                            Show ground plane
                          </label>
                        </div>
                      </div>
                      <div className="modal-footer">
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => {
                            setShowSceneEditor(false);
                            setEditingScene(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-primary"
                          onClick={() => {
                            if (!editingScene.name.trim()) {
                              alert('Please enter a scene name');
                              return;
                            }
                            
                            const existingIndex = scenes.findIndex(s => s.id === editingScene.id);
                            let updatedScenes;
                            
                            if (existingIndex >= 0) {
                              // Update existing scene
                              updatedScenes = [...scenes];
                              updatedScenes[existingIndex] = editingScene;
                            } else {
                              // Add new scene
                              updatedScenes = [...scenes, editingScene];
                            }
                            
                            // If this scene is marked as default, unmark others
                            if (editingScene.isDefault) {
                              updatedScenes = updatedScenes.map(s => 
                                s.id === editingScene.id ? s : { ...s, isDefault: false }
                              );
                            }
                            
                            setScenes(updatedScenes);
                            setShowSceneEditor(false);
                            setEditingScene(null);
                            setSuccessMessage('✓ Scene saved');
                          }}
                        >
                          {scenes.find(s => s.id === editingScene.id) ? 'Update Scene' : 'Create Scene'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

        {/* Footer with Auto-Save Status */}
        <div className="card-footer d-flex justify-content-between align-items-center">
          <div className="text-muted small">
            {metadata ? (
              <>Last updated: {new Date(metadata.updatedAt!).toLocaleString()}</>
            ) : (
              <>No metadata saved yet</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}