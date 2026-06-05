import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';
import { useProjectStructuringAwareness } from '../hooks/useProjectStructuringAwareness';
import { useProjectStructuringLock } from '../context/ProjectStructuringLockContext';
import AppMessageModal from '../shared/ui/AppMessageModal';
import {
  AppMessageModalCatalog,
  MessageModalDescriptor,
} from '../shared/ui/AppMessageModalModel';

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

type AssetType = '3d-model' | 'rti' | 'image' | 'video' | 'other';

export interface DigitalAsset {
  id: string;
  type: AssetType;
  label?: string;
  title?: string;

  entryPoint?: string;
  entryPointUrl?: string;

  fileName?: string;
  entrySize?: number;

  mimeType?: string;
  uploadedAt?: string;

  metadata?: any;
}

interface SceneConfig {
  id: string;
  label: string;
  description?: string;
  type?: '3D' | '2D';
  isDefault?: boolean;
  annotations?: string[];
  assets?: Array<any>;
  environment?: Record<string, any>;
}

interface HDTMetadata {
  _id?: string;
  projectId: string;
  physicalObjectMetadata: {
    sourceUri?: string;
    sourceType?: 'echoes' | 'wikidata' | 'arco' | 'other';
    dublinCore: DublinCoreMetadata;
    cidocCrm?: Record<string, unknown>;
  };
  gettyAAT?: Record<string, unknown>;

  digitalAssets?: DigitalAsset[];
  scenes?: SceneConfig[];

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
  const [activeTab, setActiveTab] = useState<'dublin-core' | 'assets' | 'scenes'>('dublin-core');

  // Digital Assets state
  const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUrlImportForm, setShowUrlImportForm] = useState(false);
  const [importSourceUrl, setImportSourceUrl] = useState('');
  const [urlImportLabel, setUrlImportLabel] = useState('');
  const [urlImportTitle, setUrlImportTitle] = useState('');
  const [urlImportAuthEnabled, setUrlImportAuthEnabled] = useState(false);
  const [urlImportUsername, setUrlImportUsername] = useState('');
  const [urlImportPassword, setUrlImportPassword] = useState('');
  const [importingFromUrl, setImportingFromUrl] = useState(false);

  // Scenes state
  const [scenes, setScenes] = useState<SceneConfig[]>([]);
  const [editingScene, setEditingScene] = useState<any | null>(null);
  const [showSceneEditor, setShowSceneEditor] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadRef = useRef(true);
  const {
    activeDrainingEvent,
    clearDrainingEvent,
    presenceError,
  } = useProjectStructuringAwareness({
    projectId,
    mode: 'viewing',
    enabled: !!projectId,
  });
  const { getProjectLockState } = useProjectStructuringLock();
  const projectLockState = getProjectLockState(projectId);

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
  const hdtReadOnlyWithoutProjectLock = !projectLockState.hasExclusiveLock;
  const structuringInProgress = !!activeDrainingEvent || !!presenceError;
  const ingestingAsset = uploading || importingFromUrl;

  useEffect(() => {
    fetchProjectAndMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // HELPERS

  /**
   * Normalize asset type across backend migrations.
   * Backend uses '3d-model'/'rti'. We keep a tolerant mapper anyway.
   */
  const normalizeAssetType = (t: any): '3d-model' | 'rti' | 'other' => {
    const s = String(t || '').toLowerCase();
    if (s === '3d-model' || s === 'model3d' || s === '3d' || s.includes('3d')) return '3d-model';
    if (s === 'rti' || s.includes('rti')) return 'rti';
    return 'other';
  };

  /**
   * Return the best "entry point" URL for an asset (viewer/download).
   * Prefer entryPointUrl (current schema).
   */
  const getAssetEntryPointUrl = (asset: any): string | null => {
    if (!asset) return null;
    if (typeof asset.entryPointUrl === 'string' && asset.entryPointUrl.length > 0) {
      return asset.entryPointUrl;
    }
    return null;
  };

  /**
   * Return a nice filename for UI/actions.
   * Prefer entryPoint (current schema). Fallback to fileName.
   */
  const getAssetEntryPointName = (asset: any): string => {
    if (!asset) return '(unnamed)';
    if (typeof asset.entryPoint === 'string' && asset.entryPoint.length > 0) return asset.entryPoint;
    if (typeof asset.fileName === 'string' && asset.fileName.length > 0) return asset.fileName;
    return asset.title || asset.label || asset.id || '(unnamed)';
  };

  const unwrapHdtDoc = (json: any) => {
    // Preferred: { success: true, value: <HDTDocument> }
    if (json?.value && typeof json.value === 'object' && json.value.projectId) return json.value;
    // If backend returns the HDTDocument directly
    if (json?.projectId) return json;
    // Legacy nested wrapper (old bug/format)
    if (json?.value?.value && json.value.value.projectId) return json.value.value;
    return json;
  };

  const copyAssetUrlToClipboard = async (url: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setSuccessMessage('✓ Link copied to clipboard');
        setError(null);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = url;

        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        textarea.style.zIndex = '-1';

        document.body.appendChild(textarea);
        textarea.select();

        const onCopy = async (e: ClipboardEvent) => {
          try {
            e.preventDefault();
            if (e.clipboardData) {
              e.clipboardData.setData('text/plain', url);
              resolve();
            } else {
              reject(new Error('No clipboardData available'));
            }
          } catch (err) {
            reject(err);
          } finally {
            document.removeEventListener('copy', onCopy);
            document.body.removeChild(textarea);
          }
        };

        document.addEventListener('copy', onCopy);

        const successful = document.dispatchEvent(
          new ClipboardEvent('copy', { bubbles: true, cancelable: true })
        );

        if (!successful) {
          reject(new Error('Copy event was not handled'));
        }
      });

      setSuccessMessage('✓ Link copied to clipboard');
      setError(null);
    } catch (err) {
      console.error('Failed to copy asset URL:', err);
      setError('Failed to copy link to clipboard');
    }
  };

  /**
   * Create a new asset entry in HDT "digitalAssets" and return the generated assetId.
   * Backend: POST /api/projects/:projectId/hdt/assets
   */
  const createHdtAsset = async (
    type: '3d-model' | 'rti' | 'auto',
    label: string,
    title: string
  ): Promise<string> => {
    if (!projectId) throw new Error('Missing projectId');

    const actualType = type === 'auto' ? '3d-model' : type;
    console.log(`🔧 [CreateHDTAsset] Creating ${actualType} asset: ${label}`);

    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/assets`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: actualType, label, title }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`❌ [CreateHDTAsset] HTTP ${res.status}:`, err);
      throw new Error(err.error || `Failed to create ${actualType} asset in HDT`);
    }

    const json: any = await res.json();
    console.log(`📥 [CreateHDTAsset] Backend response:`, json);

    const hdtDoc = unwrapHdtDoc(json);

    if (!hdtDoc?.digitalAssets || !Array.isArray(hdtDoc.digitalAssets)) {
      console.error(`❌ [CreateHDTAsset] Invalid HDT document:`, hdtDoc);
      throw new Error('Backend did not return a valid HDT document');
    }

    const assets = hdtDoc.digitalAssets;
    const assetId = assets.length > 0 ? assets[assets.length - 1].id : undefined;

    if (!assetId) {
      console.error(`❌ [CreateHDTAsset] No assetId found in HDT document:`, hdtDoc);
      throw new Error('Backend did not return a valid assetId');
    }

    console.log(`✅ [CreateHDTAsset] Successfully created asset: ${assetId}`);
    return assetId;
  };

  /**
   * Update existing asset metadata in HDT.
   * Backend: PUT /api/projects/:projectId/hdt/assets/:assetId
   */
  const updateHdtAsset = async (assetId: string, patch: Record<string, any>): Promise<void> => {
    if (!projectId) throw new Error('Missing projectId');

    console.log(`🔧 [UpdateHDTAsset] Updating asset ${assetId} with:`, patch);

    const res = await fetch(
      `${getApiBase()}/api/projects/${projectId}/hdt/assets/${encodeURIComponent(assetId)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`❌ [UpdateHDTAsset] Failed to update asset:`, err);
      throw new Error(err.error || 'Failed to update asset metadata');
    }

    console.log(`✅ [UpdateHDTAsset] Successfully updated asset ${assetId}`);
  };

  /**
   * Delete an asset from HDT.
   * Backend: DELETE /api/projects/:projectId/hdt/assets/:assetId
   */
  const deleteHdtAsset = async (assetId: string): Promise<void> => {
    if (!projectId) throw new Error('Missing projectId');

    const res = await fetch(
      `${getApiBase()}/api/projects/${projectId}/hdt/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE', credentials: 'include' }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete asset');
    }
  };

  const rollbackPartialImportedAsset = async (assetId: string): Promise<string> => {
    try {
      await deleteHdtAsset(assetId);
      return 'The partially created asset entry was removed automatically.';
    } catch (cleanupError: any) {
      return `Automatic cleanup failed: ${cleanupError?.message || 'Unable to delete the partial asset.'}`;
    }
  };

  const toScenePayload = (scene: SceneConfig): Record<string, any> => ({
    label: scene.label?.trim() || '',
    description: scene.description || '',
    type: scene.type || '3D',
    isDefault: !!scene.isDefault,
    assets: Array.isArray(scene.assets) ? scene.assets : [],
    environment: scene.environment || {},
  });

  const createHdtScene = async (scene: SceneConfig): Promise<string | null> => {
    if (!projectId) throw new Error('Missing projectId');

    const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toScenePayload(scene)),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create scene');
    }

    const updatedDoc = await response.json();
    const createdScene = Array.isArray(updatedDoc?.scenes)
      ? updatedDoc.scenes[updatedDoc.scenes.length - 1]
      : null;

    return createdScene?.id || null;
  };

  const updateHdtScene = async (sceneId: string, patch: Partial<SceneConfig>): Promise<void> => {
    if (!projectId) throw new Error('Missing projectId');

    const payload: Record<string, any> = { ...patch };
    delete payload.id;

    const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${encodeURIComponent(sceneId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update scene');
    }
  };

  const deleteHdtScene = async (sceneId: string): Promise<void> => {
    if (!projectId) throw new Error('Missing projectId');

    const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/scenes/${encodeURIComponent(sceneId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete scene');
    }
  };

  const fetchProjectAndMetadata = async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch project details
      const projectResponse = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!projectResponse.ok) {
        throw new Error(`Failed to fetch project: ${projectResponse.status}`);
      }

      const projectData = await projectResponse.json();
      const proj: Project = (projectData?.project ?? projectData) as Project;
      setProject(proj);

      // Fetch HDT metadata (might not exist yet)
      const metadataResponse = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (metadataResponse.ok) {
        const metadataData: HDTMetadata = await metadataResponse.json();
        setMetadata(metadataData);
        populateFormFromMetadata(metadataData);

        setDigitalAssets(Array.isArray(metadataData.digitalAssets) ? metadataData.digitalAssets : []);
        setScenes(Array.isArray(metadataData.scenes) ? metadataData.scenes : []);
      } else if (metadataResponse.status === 404) {
        console.log('No HDT metadata found, will create on first save');
        setMetadata(null);
        setDigitalAssets([]);
        setScenes([]);
      } else {
        throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
      }
    } catch (e: any) {
      console.error('Failed to fetch project/metadata:', e);
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setTimeout(() => {
        setDataLoaded(true);
        initialLoadRef.current = false;
      }, 100);
    }
  };

  const populateFormFromMetadata = (meta: HDTMetadata) => {
    const dublinCore = meta.physicalObjectMetadata?.dublinCore;

    // Dublin Core
    if (dublinCore) {
      setDcTitle(dublinCore.title || '');
      setDcDescription(dublinCore.description || '');
      setDcCreator(Array.isArray(dublinCore.creator) ? dublinCore.creator.join(', ') : '');
      setDcSubject(Array.isArray(dublinCore.subject) ? dublinCore.subject.join(', ') : '');
      setDcDate(dublinCore.date || '');
      setDcType(Array.isArray(dublinCore.type) ? dublinCore.type.join(', ') : '');
      setDcLanguage(Array.isArray(dublinCore.language) ? dublinCore.language.join(', ') : '');
      setDcCoverage(dublinCore.coverage || '');
      setDcRights(dublinCore.rights || '');
      setDcSource(dublinCore.source || '');
    }
  };

  // Manual save function (called by Save button)
  const handleManualSave = async () => {
    await autoSaveMetadata();
    setSuccessMessage('✅ Metadata saved successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Auto-save metadata function
  const autoSaveMetadata = useCallback(async () => {
    if (!projectId) return;

    try {
      setSaving(true);
      setError(null);

      const metadataPayload: Partial<HDTMetadata> = {
        physicalObjectMetadata: {
          sourceUri:
            metadata?.physicalObjectMetadata?.sourceUri || `urn:ocra:project:${projectId}`,
          sourceType:
            metadata?.physicalObjectMetadata?.sourceType || 'other',
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
          cidocCrm: metadata?.physicalObjectMetadata?.cidocCrm,
        },
        gettyAAT: {},
        digitalAssets: digitalAssets.length > 0 ? digitalAssets : undefined,
        scenes: scenes.length > 0 ? scenes : undefined,
      };

      if (!metadata) {
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadataPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to create metadata');
        }

        const newMetadata = await response.json();
        setMetadata(newMetadata);
      } else {
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadataPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
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
  }, [
    projectId,
    dcTitle, dcDescription, dcCreator, dcSubject, dcDate, dcType, dcLanguage, dcCoverage, dcRights, dcSource,
    digitalAssets, scenes,
    metadata,
  ]);

  if (loading) {
    return (
      <div className="container-fluid py-5 text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted mt-3">Loading HDT management...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid py-5">
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
      <div className="container-fluid py-5">
        <div className="alert alert-warning mb-3">
          <h3 className="h5">Project Not Found</h3>
          <p className="mb-3">The requested project could not be found.</p>
          <Link to="/projects" className="btn btn-primary">Back to Projects</Link>
        </div>
      </div>
    );
  }

  const deriveAssetNameSuggestion = (sourceName: string) => {
    const fallback = 'remote_asset';
    const sanitizedSource = sourceName.trim().split('/').pop() || fallback;
    const fileName = sanitizedSource || fallback;
    const title = fileName.replace(/\.[^/.]+$/, '') || fallback;
    return {
      label: fileName,
      title,
    };
  };

  /**
   * Determine asset type from file extension and name.
   * ZIP archives with RTI-related keywords are classified as RTI, otherwise as 3D archives.
   */
  const determineAssetTypeFromName = (sourceName: string): '3d-model' | 'rti' => {
    const fileName = sourceName.toLowerCase();
    const ext = fileName.split('.').pop() || '';

    if (ext === 'zip') {
      const rtiKeywords = ['rti', 'reflectance', 'ptm', 'hsh'];
      const hasRtiKeyword = rtiKeywords.some((keyword) => fileName.includes(keyword));
      if (hasRtiKeyword) {
        console.log(`🎯 [TypeDetection] ZIP file with RTI keyword detected: ${sourceName}`);
        return 'rti';
      }
      console.log(`📦 [TypeDetection] ZIP file assumed to be 3D model archive: ${sourceName}`);
      return '3d-model';
    }

    const model3dExtensions = ['ply', 'obj', 'gltf', 'glb', 'fbx', 'dae', 'x3d', 'stl', '3ds', 'nxz', 'ase', 'ifc'];
    if (model3dExtensions.includes(ext)) {
      console.log(`🎲 [TypeDetection] Direct 3D model file detected: ${sourceName}`);
      return '3d-model';
    }

    console.log(`❓ [TypeDetection] Unknown file type, defaulting to 3d-model: ${sourceName}`);
    return '3d-model';
  };

  const determineAssetType = (file: File): '3d-model' | 'rti' => determineAssetTypeFromName(file.name);

  /**
   * Unified asset upload handler (2-step flow preserved)
   */
  const handleUnifiedAssetUpload = async (file: File, assetLabel: string, assetTitle: string) => {
    if (!projectId) throw new Error('Missing projectId');

    try {
      setError(null);
      setSuccessMessage(null);
      setWarningMessages([]);
      setUploading(true);
      setUploadProgress(0);

      // 1) Create asset entry in HDT first
      const assetType = determineAssetType(file);
      console.log(`🔍 [UnifiedUpload] Detected asset type: ${assetType} for file: ${file.name}`);
      const assetId = await createHdtAsset(assetType, assetLabel, assetTitle);

      // 2) Upload file to unified endpoint with progress tracking
      const uploadResponse = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
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
        };

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

        xhr.open('POST', `${getApiBase()}/api/projects/${projectId}/files`);
        xhr.withCredentials = true;

        const formData = new FormData();
        formData.append('assetId', assetId);
        formData.append('file', file);
        xhr.send(formData);
      });

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }

      // 3) Extract upload response data
      const uploadJson: any = await uploadResponse.json();
      console.log('🔄 [UnifiedUpload] Backend response:', uploadJson);

      const responseData = uploadJson.value || uploadJson;
      const uploadWarnings = Array.isArray(responseData.warnings)
        ? responseData.warnings.filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
        : [];

      // 4) Update asset with complete data (entrySize, entryPointUrl, etc.)
      const updatePayload: Record<string, any> = {
        fileName: responseData.fileName || file.name,
        entrySize: responseData.entrySize ?? file.size,
        entryPointUrl: responseData.entryPointUrl,
        entryPoint: responseData.entryPoint,
        mimeType: responseData.mimeType || file.type,
        uploadedAt: new Date().toISOString(),
        ...(responseData.metadata !== undefined ? { metadata: responseData.metadata } : {})
      };

      switch (responseData.type) {
        case 'rti':
          updatePayload.type = 'rti';
          break;
        case '3d-model':
        case '3d-model-archive':
          updatePayload.type = '3d-model';
          break;
        default:
          throw new Error(`Unsupported upload response type: ${responseData.type}`);
      }

      // 5) Update asset metadata with complete data
      await updateHdtAsset(assetId, updatePayload);

      // 6) Refresh data and show success
      await fetchProjectAndMetadata();

      const typeLabel = responseData.type === 'rti' ? 'RTI' : '3D model';
      setSuccessMessage(`✓ ${typeLabel} asset "${file.name}" uploaded and saved successfully!`);
      setWarningMessages(uploadWarnings);
    } catch (err: any) {
      console.error('[UnifiedUpload] Error:', err);
      setError(err?.message || 'Failed to upload asset');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const populateUrlImportSuggestions = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      const suggestions = deriveAssetNameSuggestion(decodeURIComponent(parsed.pathname));
      setUrlImportLabel((current) => current.trim() ? current : suggestions.label);
      setUrlImportTitle((current) => current.trim() ? current : suggestions.title);
    } catch {
      // Ignore incomplete URLs while the user is typing.
    }
  };

  const resetUrlImportForm = () => {
    setImportSourceUrl('');
    setUrlImportLabel('');
    setUrlImportTitle('');
    setUrlImportAuthEnabled(false);
    setUrlImportUsername('');
    setUrlImportPassword('');
    setShowUrlImportForm(false);
  };

  const handleImportAssetFromUrl = async () => {
    if (!projectId) {
      throw new Error('Missing projectId');
    }

    const trimmedUrl = importSourceUrl.trim();
    if (!trimmedUrl) {
      setMessageModal(
        AppMessageModalCatalog.warning(
          'Please provide a source URL before starting the import.',
          'Missing URL',
        ),
      );
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      setMessageModal(
        AppMessageModalCatalog.warning(
          'Please provide a valid absolute URL, including the http:// or https:// scheme.',
          'Invalid URL',
        ),
      );
      return;
    }

    const sourceName = decodeURIComponent(parsedUrl.pathname.split('/').pop() || 'remote_asset');
    const assetLabel = (urlImportLabel.trim() || deriveAssetNameSuggestion(sourceName).label);
    const assetTitle = (urlImportTitle.trim() || deriveAssetNameSuggestion(sourceName).title);

    if (urlImportAuthEnabled && !urlImportUsername.trim()) {
      setMessageModal(
        AppMessageModalCatalog.warning(
          'Username is required when HTTP Basic Auth is enabled.',
          'Missing credentials',
        ),
      );
      return;
    }

    let createdAssetId: string | null = null;

    try {
      setError(null);
      setSuccessMessage(null);
      setWarningMessages([]);
      setMessageModal(null);
      setImportingFromUrl(true);

      const assetType = determineAssetTypeFromName(sourceName);
      const assetId = await createHdtAsset(assetType, assetLabel, assetTitle);
      createdAssetId = assetId;

      const response = await fetch(`${getApiBase()}/api/projects/${projectId}/files/import-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          sourceUrl: trimmedUrl,
          authType: urlImportAuthEnabled ? 'basic' : 'none',
          ...(urlImportAuthEnabled
            ? {
              username: urlImportUsername.trim(),
              password: urlImportPassword,
            }
            : {}),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.message || json.error || 'Failed to import asset from URL');
      }

      const responseData = json.value || json;
      const importWarnings = Array.isArray(responseData.warnings)
        ? responseData.warnings.filter((warning: unknown): warning is string => typeof warning === 'string' && warning.trim().length > 0)
        : [];

      const updatePayload: Record<string, any> = {
        fileName: responseData.fileName || sourceName,
        entrySize: responseData.entrySize,
        entryPointUrl: responseData.entryPointUrl,
        entryPoint: responseData.entryPoint,
        mimeType: responseData.mimeType || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        ...(responseData.metadata !== undefined ? { metadata: responseData.metadata } : {}),
      };

      switch (responseData.type) {
        case 'rti':
          updatePayload.type = 'rti';
          break;
        case '3d-model':
        case '3d-model-archive':
          updatePayload.type = '3d-model';
          break;
        default:
          throw new Error(`Unsupported import response type: ${responseData.type}`);
      }

      await updateHdtAsset(assetId, updatePayload);
      await fetchProjectAndMetadata();

      const typeLabel = responseData.type === 'rti' ? 'RTI' : '3D model';
      setSuccessMessage(`✓ ${typeLabel} asset imported successfully from URL!`);
      setWarningMessages(importWarnings);
      resetUrlImportForm();
    } catch (err: any) {
      console.error('[UnifiedUpload] Remote import error:', err);
      setError(null);

      const details: string[] = [];
      if (typeof err?.message === 'string' && err.message.trim()) {
        details.push(err.message.trim());
      }

      if (createdAssetId) {
        const cleanupResult = await rollbackPartialImportedAsset(createdAssetId);
        details.push(cleanupResult);
      }

      setMessageModal(
        AppMessageModalCatalog.error(
          'The asset could not be imported from the provided URL.',
          'Asset import failed',
          details,
        ),
      );
    } finally {
      setImportingFromUrl(false);
    }
  };

  return (
    <>
    <div className="container-fluid py-4 px-4">
      {/* Header */}
      <div className="d-flex align-items-center mb-4">
        <div className="flex-grow-1">
          <h1 className="h3 mb-0">HDT Metadata</h1>
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

      {structuringInProgress && (
        <div className="alert alert-warning d-flex justify-content-between align-items-start gap-3">
          <div>
            <strong>Structuring...</strong>{' '}
            {activeDrainingEvent
              ? 'Another session is preparing a project-wide structuring operation. Asset upload is temporarily blocked until draining completes.'
              : presenceError}
            {activeDrainingEvent?.username && (
              <div className="small mt-2 text-muted">
                Requested by: {activeDrainingEvent.username}
              </div>
            )}
            {activeDrainingEvent?.operationType && (
              <div className="small mt-2 text-muted">
                Operation: {activeDrainingEvent.operationType}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm flex-shrink-0"
            onClick={() => clearDrainingEvent()}
          >
            Dismiss
          </button>
        </div>
      )}

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

      {warningMessages.length > 0 && (
        <div className="alert alert-warning alert-dismissible fade show" role="alert">
          <strong>Warnings:</strong>
          <ul className="mb-0 mt-2">
            {warningMessages.map((warning, idx) => (
              <li key={`${idx}-${warning}`}>{warning}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-close"
            onClick={() => setWarningMessages([])}
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
                HC2 Digital Asset
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

              <fieldset disabled={hdtReadOnlyWithoutProjectLock}>

              <div className="mb-3">
                <label htmlFor="dc-title" className="form-label">Title <span className="text-muted fw-normal small">(dc:title)</span></label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-title"
                  value={dcTitle}
                  onChange={(e) => setDcTitle(e.target.value)}
                  placeholder="Heritage Digital Twin title"
                />
              </div>

              <div className="mb-3">
                <label htmlFor="dc-description" className="form-label">Description <span className="text-muted fw-normal small">(dc:description)</span></label>
                <textarea
                  className="form-control"
                  id="dc-description"
                  rows={4}
                  value={dcDescription}
                  onChange={(e) => setDcDescription(e.target.value)}
                  placeholder="Detailed description of the heritage object"
                ></textarea>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-creator" className="form-label">Creator(s) <span className="text-muted fw-normal small">(dc:creator, comma-separated)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-creator"
                    value={dcCreator}
                    onChange={(e) => setDcCreator(e.target.value)}
                    placeholder="Artist, sculptor, architect (comma-separated)"
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-date" className="form-label">Date <span className="text-muted fw-normal small">(dc:date — year, year-month, or ISO 8601)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-date"
                    value={dcDate}
                    onChange={(e) => setDcDate(e.target.value)}
                    placeholder="e.g., 1924, 1924-05, 1924-05-15"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="dc-subject" className="form-label">Subject / Keywords <span className="text-muted fw-normal small">(dc:subject, comma-separated)</span></label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-subject"
                  value={dcSubject}
                  onChange={(e) => setDcSubject(e.target.value)}
                  placeholder="sculpture, renaissance, marble, religious art (comma-separated)"
                />
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-type" className="form-label">Type(s) <span className="text-muted fw-normal small">(dc:type, comma-separated)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-type"
                    value={dcType}
                    onChange={(e) => setDcType(e.target.value)}
                    placeholder="3D Model, Sculpture, Artifact (comma-separated)"
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-language" className="form-label">Language(s) <span className="text-muted fw-normal small">(dc:language, ISO 639 codes)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-language"
                    value={dcLanguage}
                    onChange={(e) => setDcLanguage(e.target.value)}
                    placeholder="en, it, la (comma-separated ISO 639 codes)"
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-coverage" className="form-label">Coverage <span className="text-muted fw-normal small">(dc:coverage)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-coverage"
                    value={dcCoverage}
                    onChange={(e) => setDcCoverage(e.target.value)}
                    placeholder="Spatial or temporal coverage"
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="dc-source" className="form-label">Source <span className="text-muted fw-normal small">(dc:source)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    id="dc-source"
                    value={dcSource}
                    onChange={(e) => setDcSource(e.target.value)}
                    placeholder="Original source or reference"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="dc-rights" className="form-label">Rights Statement <span className="text-muted fw-normal small">(dc:rights)</span></label>
                <input
                  type="text"
                  className="form-control"
                  id="dc-rights"
                  value={dcRights}
                  onChange={(e) => setDcRights(e.target.value)}
                  placeholder="Copyright statement or rights information"
                />
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
              </fieldset>
            </div>
          )}

          {/* Digital Assets Tab */}
          {activeTab === 'assets' && (
            <div>
              <p className="text-muted small mb-4">
                Manage all digital assets for this HC2 Heritage Digital Twin. Assets in the pool can be used across multiple scenes.
              </p>

              <div className="mb-4 p-3 bg-light rounded">
                <h6 className="mb-2">Supported Asset Types</h6>
                <div className="d-flex gap-2 flex-wrap">
                  <span className="badge bg-primary">3D Models (GLB, GLTF, PLY, OBJ, NXS, NXZ)</span>
                  <span className="badge bg-primary">RTI</span>
                  <span className="badge bg-secondary text-muted">Images (Coming Soon)</span>
                  <span className="badge bg-secondary text-muted">Videos (Coming Soon)</span>
                </div>
                <div className="form-text mt-2">
                  Asset upload is still allowed without the project lock, but only when no structuring session is already in progress.
                </div>
              </div>

              {/* Current Assets List */}
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0">Asset Pool ({digitalAssets.length})</h6>
                </div>

                {digitalAssets.length === 0 ? (
                  <div className="alert alert-info">
                    <strong>No assets yet.</strong> Upload files below to add them to your asset pool.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Label</th>
                          <th>Filename</th>
                          <th>Size</th>
                          <th>Added</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {digitalAssets.map((asset, index) => (
                          <tr key={asset.id || index}>
                            <td>
                              {asset.type === '3d-model' && '3D Model'}
                              {asset.type === 'rti' && 'RTI'}
                              {asset.type === 'image' && 'Image'}
                              {asset.type === 'video' && 'Video'}
                              {asset.type === 'other' && 'Other'}
                            </td>
                            <td>
                              <strong>{asset.label || asset.title || '(unnamed)'}</strong>
                            </td>
                            <td className="text-muted small">
                              {asset.fileName || '-'}
                            </td>
                            <td className="text-muted small">
                              {asset.entrySize ? `${(asset.entrySize / (1024 * 1024)).toFixed(2)} MB` : '-'}
                            </td>
                            <td className="text-muted small">
                              {asset.uploadedAt ? new Date(asset.uploadedAt).toLocaleDateString() : '-'}
                            </td>
                            <td>
                              {(() => {
                                const kind = normalizeAssetType(asset.type);
                                const url = getAssetEntryPointUrl(asset);
                                const name = getAssetEntryPointName(asset);

                                return (
                                  <div className="d-flex gap-2 flex-wrap">
                                    {kind === '3d-model' && url && (
                                      <>
                                        <a
                                          className="btn btn-sm btn-outline-primary"
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Download/open the 3D model entry file"
                                        >
                                          Download
                                        </a>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          onClick={() => copyAssetUrlToClipboard(url)}
                                          title="Copy 3D model URL to clipboard"
                                        >
                                          Copy URL
                                        </button>
                                      </>
                                    )}

                                    {kind === 'rti' && url && (
                                      <>
                                        <a
                                          className="btn btn-sm btn-outline-primary"
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Open RTI info.json"
                                        >
                                          Open info.json
                                        </a>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          onClick={() => copyAssetUrlToClipboard(url)}
                                          title="Copy RTI info.json URL to clipboard"
                                        >
                                          Copy URL
                                        </button>
                                      </>
                                    )}

                                    {!url && (
                                      <span className="text-muted small">
                                        No URL available yet
                                      </span>
                                    )}

                                    <button
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={hdtReadOnlyWithoutProjectLock}
                                      onClick={async () => {
                                        const displayName = name;
                                        if (!confirm(`Delete "${displayName}"? This will remove the asset and its stored files and cannot be undone.`)) {
                                          return;
                                        }

                                        try {
                                          setError(null);
                                          setSuccessMessage(null);

                                          await deleteHdtAsset(asset.id);
                                          setDigitalAssets((prev) => prev.filter((a) => a.id !== asset.id));

                                          await fetchProjectAndMetadata();
                                          setSuccessMessage(`✓ Asset "${displayName}" deleted successfully!`);
                                        } catch (err: any) {
                                          setError(err?.message || 'Failed to delete asset');
                                        }
                                      }}
                                      title={`Delete "${name}"`}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                );
                              })()}
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
                <h6 className="text-primary mb-2">Add a new asset</h6>
                <input
                  id="unifiedAssetInput"
                  type="file"
                  className="d-none"
                  accept=".ply,.obj,.gltf,.glb,.fbx,.dae,.x3d,.stl,.3ds,.zip"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const isZip = file.name.toLowerCase().endsWith('.zip');
                    const isDirectObj = file.name.toLowerCase().endsWith('.obj') && !isZip;
                    const is3DFile = ['.ply', '.obj', '.gltf', '.glb', '.fbx', '.dae', '.x3d', '.stl', '.3ds']
                      .some(ext => file.name.toLowerCase().endsWith(ext));

                    if (!isZip && !is3DFile) {
                      setError('Please select a 3D model file or ZIP archive.');
                      setWarningMessages([]);
                      (e.target as HTMLInputElement).value = '';
                      return;
                    }
                    if (isDirectObj) {
                      setWarningMessages([
                        `Direct OBJ upload selected ("${file.name}"). If this model requires external materials/textures, upload a ZIP containing .obj + .mtl + texture files.`
                      ]);
                    } else {
                      setWarningMessages([]);
                    }
                    // asset label by default is the filename with extension
                    const assetLabel = file.name;
                    // asset title by default is filename without extension
                    const assetTitle = file.name.replace(/\.[^/.]+$/, '');

                    try {
                      await handleUnifiedAssetUpload(file, assetLabel.trim(), assetTitle.trim());
                    } finally {
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  disabled={ingestingAsset || (structuringInProgress && !projectLockState.hasExclusiveLock)}
                />

                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => document.getElementById('unifiedAssetInput')?.click()}
                    disabled={ingestingAsset || (structuringInProgress && !projectLockState.hasExclusiveLock)}
                  >
                    {uploading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Uploading... {uploadProgress}%
                      </>
                    ) : (
                      <>📁 Upload Asset (3D or RTI)</>
                    )}
                  </button>

                  <button
                    className="btn btn-outline-primary"
                    type="button"
                    onClick={() => setShowUrlImportForm((current) => !current)}
                    disabled={ingestingAsset || (structuringInProgress && !projectLockState.hasExclusiveLock)}
                  >
                    {importingFromUrl ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Importing...
                      </>
                    ) : (
                      <>🔗 Import Asset from URL</>
                    )}
                  </button>
                </div>

                {showUrlImportForm && (
                  <div className="card border-primary-subtle mt-3">
                    <div className="card-body">
                      <div className="mb-3">
                        <label htmlFor="assetImportUrl" className="form-label">Remote URL</label>
                        <input
                          id="assetImportUrl"
                          type="url"
                          className="form-control"
                          placeholder="https://example.org/path/to/asset.zip"
                          value={importSourceUrl}
                          onChange={(e) => setImportSourceUrl(e.target.value)}
                          onBlur={(e) => populateUrlImportSuggestions(e.target.value)}
                          disabled={importingFromUrl}
                        />
                        <div className="form-text">
                          The backend will download the remote file and ingest it as a 3D model or RTI dataset.
                        </div>
                      </div>

                      <div className="row g-3">
                        <div className="col-md-6">
                          <label htmlFor="assetImportLabel" className="form-label">Asset label</label>
                          <input
                            id="assetImportLabel"
                            type="text"
                            className="form-control"
                            value={urlImportLabel}
                            onChange={(e) => setUrlImportLabel(e.target.value)}
                            disabled={importingFromUrl}
                          />
                        </div>
                        <div className="col-md-6">
                          <label htmlFor="assetImportTitle" className="form-label">Asset title</label>
                          <input
                            id="assetImportTitle"
                            type="text"
                            className="form-control"
                            value={urlImportTitle}
                            onChange={(e) => setUrlImportTitle(e.target.value)}
                            disabled={importingFromUrl}
                          />
                        </div>
                      </div>

                      <div className="form-check mt-3">
                        <input
                          id="assetImportBasicAuth"
                          className="form-check-input"
                          type="checkbox"
                          checked={urlImportAuthEnabled}
                          onChange={(e) => setUrlImportAuthEnabled(e.target.checked)}
                          disabled={importingFromUrl}
                        />
                        <label className="form-check-label" htmlFor="assetImportBasicAuth">
                          This URL requires HTTP Basic Auth (.htaccess / .htpasswd)
                        </label>
                      </div>

                      {urlImportAuthEnabled && (
                        <div className="row g-3 mt-1">
                          <div className="col-md-6">
                            <label htmlFor="assetImportUsername" className="form-label">Username</label>
                            <input
                              id="assetImportUsername"
                              type="text"
                              className="form-control"
                              value={urlImportUsername}
                              onChange={(e) => setUrlImportUsername(e.target.value)}
                              disabled={importingFromUrl}
                              autoComplete="username"
                            />
                          </div>
                          <div className="col-md-6">
                            <label htmlFor="assetImportPassword" className="form-label">Password</label>
                            <input
                              id="assetImportPassword"
                              type="password"
                              className="form-control"
                              value={urlImportPassword}
                              onChange={(e) => setUrlImportPassword(e.target.value)}
                              disabled={importingFromUrl}
                              autoComplete="current-password"
                            />
                          </div>
                        </div>
                      )}

                      <div className="d-flex gap-2 mt-3">
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => void handleImportAssetFromUrl()}
                          disabled={importingFromUrl}
                        >
                          Import from URL
                        </button>
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={resetUrlImportForm}
                          disabled={importingFromUrl}
                        >
                          Cancel
                        </button>
                      </div>
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
                    disabled={hdtReadOnlyWithoutProjectLock}
                    onClick={() => {
                      const newScene: SceneConfig = {
                        id: `scene_${Date.now()}`,
                        label: `Scene ${scenes.length + 1}`,
                        description: '',
                        isDefault: scenes.length === 0,
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
                                {scene.label}
                                {scene.isDefault && <span className="badge bg-success ms-2">Default</span>}
                              </h6>
                              <div className="btn-group btn-group-sm">
                                <button
                                  className="btn btn-outline-primary"
                                  disabled={hdtReadOnlyWithoutProjectLock}
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
                                  disabled={hdtReadOnlyWithoutProjectLock}
                                  onClick={async () => {
                                    if (scenes.length === 1) {
                                      alert('Cannot delete the last scene. Projects must have at least one scene.');
                                      return;
                                    }
                                    if (confirm(`Delete scene "${scene.label}"?`)) {
                                      try {
                                        setError(null);
                                        setSuccessMessage(null);
                                        await deleteHdtScene(scene.id);
                                        await fetchProjectAndMetadata();
                                        setSuccessMessage('✓ Scene deleted');
                                      } catch (err: any) {
                                        setError(err?.message || 'Failed to delete scene');
                                      }
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
                        <fieldset disabled={hdtReadOnlyWithoutProjectLock}>
                        <div className="mb-3">
                          <label className="form-label">Scene Name *</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editingScene.label}
                            onChange={(e) => setEditingScene({ ...editingScene, label: e.target.value })}
                            placeholder="e.g., Overview, Detail View, Restoration"
                          />
                        </div>

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
                                            const newAssetRef = {
                                              assetId: asset.id,
                                              visible: true,
                                            };
                                            setEditingScene({
                                              ...editingScene,
                                              assets: [...(editingScene.assets || []), newAssetRef],
                                            });
                                          } else {
                                            setEditingScene({
                                              ...editingScene,
                                              assets: (editingScene.assets || []).filter((a: any) => a.assetId !== asset.id),
                                            });
                                          }
                                        }}
                                      />
                                      <div className="flex-grow-1">
                                        <div>
                                          <strong>{asset.fileName || asset.title || asset.label || '(unnamed)'}</strong>
                                          <span className="badge bg-secondary ms-2">{asset.type}</span>
                                        </div>
                                        {asset.entrySize !== undefined && (
                                          <small className="text-muted">
                                            {asset.entrySize
                                              ? `${(asset.entrySize / 1024 / 1024).toFixed(2)} MB`
                                              : '-'
                                            }
                                          </small>
                                        )}
                                      </div>
                                      {isInScene && (
                                        <button
                                          className="btn btn-sm btn-outline-secondary"
                                          onClick={() => {
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
                        </fieldset>
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
                          disabled={hdtReadOnlyWithoutProjectLock}
                          onClick={async () => {
                            if (!editingScene.label.trim()) {
                              alert('Please enter a scene name');
                              return;
                            }

                            const isExisting = scenes.some((s) => s.id === editingScene.id);

                            try {
                              setError(null);
                              setSuccessMessage(null);

                              if (editingScene.isDefault) {
                                const scenesToUnset = scenes.filter(
                                  (s) => s.id !== editingScene.id && s.isDefault
                                );
                                await Promise.all(
                                  scenesToUnset.map((s) => updateHdtScene(s.id, { isDefault: false }))
                                );
                              }

                              if (isExisting) {
                                await updateHdtScene(editingScene.id, toScenePayload(editingScene));
                              } else {
                                await createHdtScene(editingScene);
                              }

                              await fetchProjectAndMetadata();
                              setShowSceneEditor(false);
                              setEditingScene(null);
                              setSuccessMessage('✓ Scene saved');
                            } catch (err: any) {
                              setError(err?.message || 'Failed to save scene');
                            }
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

        </div>

        {/* Footer */}
        <div className="card-footer d-flex justify-content-between align-items-center">
          <div className="text-muted small">
            {metadata?.updatedAt ? (
              <>Last updated: {new Date(metadata.updatedAt).toLocaleString()}</>
            ) : (
              <>No metadata saved yet</>
            )}
          </div>
        </div>
      </div>
    </div>
    <AppMessageModal
      descriptor={messageModal}
      onClose={() => setMessageModal(null)}
      onAction={() => setMessageModal(null)}
    />
    </>
  );
}
