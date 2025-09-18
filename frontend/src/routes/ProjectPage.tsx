import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, Link } from 'react-router-dom';
import ThreeViewer from '../components/ThreeViewer';

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

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isManager, setIsManager] = useState<boolean>(false);
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch project info, user info, and file list
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch project
        const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch project');
        const data = await response.json();
        setProject(data.project);
        // Fetch user
        const userData = await getCurrentUser();
        setUser(userData);
        // Fetch files
        const filesRes = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}/files`, {
          credentials: 'include'
        });
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          setFiles(filesData.files || []);
        } else {
          setFiles([]);
        }
        // Fetch is-manager
        const isManagerRes = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}/is-manager`, {
          credentials: 'include'
        });
        if (isManagerRes.ok) {
          const mgr = await isManagerRes.json();
          setIsManager(!!mgr.isManager);
        } else {
          setIsManager(false);
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchAll();
    // eslint-disable-next-line
  }, [projectId]);

  // isManager now comes from backend API

  if (loading) {
    return <div className="container py-5 text-center text-muted">Loading...</div>;
  }
  if (error) {
    return <div className="container py-5 text-danger">Error: {error}</div>;
  }
  if (!project) {
    return <div className="container py-5">Project not found</div>;
  }

  return (
    <div className="container py-5">
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
            <h1 className="h3 mb-0 text-dark">{project.name}</h1>
            <div className="text-secondary fw-semibold">
              Manager: {project.manager ? project.manager.displayName : <span className="text-warning">Unassigned</span>}
            </div>
          </div>
          <div className="row g-4">
            {/* 3D Viewer */}
            <div className="col-md-8">
              <div className="bg-light border border-2 border-secondary-subtle rounded" style={{ minHeight: 300 }}>
                <div style={{ padding: 8 }}>
                  <ThreeViewer height={320} />
                </div>
              </div>
            </div>
            {/* File List + Upload */}
            <div className="col-md-4">
              <div className="bg-white border rounded p-3">
                <h3 className="h6 mb-3 text-dark">Project Files</h3>
                {isManager && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setUploadError(null);
                      const form = e.target as HTMLFormElement;
                      const fileInput = form.elements.namedItem('file') as HTMLInputElement;
                      if (!fileInput.files || fileInput.files.length === 0) {
                        setUploadError('Please select a file to upload.');
                        return;
                      }
                      const file = fileInput.files[0];
                      const formData = new FormData();
                      formData.append('file', file);
                      setUploading(true);
                      try {
                        const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}/files`, {
                          method: 'POST',
                          credentials: 'include',
                          body: formData
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || 'Upload failed');
                        }
                        // Refresh file list
                        const filesRes = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}/files`, { credentials: 'include' });
                        const filesData = await filesRes.json();
                        setFiles(filesData.files || []);
                        fileInput.value = '';
                      } catch (err: any) {
                        setUploadError(err?.message || 'Upload failed');
                      } finally {
                        setUploading(false);
                      }
                    }}
                    className="mb-3 d-flex align-items-center gap-2"
                  >
                    <input type="file" name="file" className="form-control form-control-sm" disabled={uploading} />
                    <button type="submit" className="btn btn-primary btn-sm fw-semibold" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
                  </form>
                )}
                {uploadError && <div className="text-danger small mb-2">{uploadError}</div>}
                <div className="border-top pt-2" style={{ maxHeight: 350, overflowY: 'auto' }}>
                  {files.length === 0 ? (
                    <div className="text-muted fst-italic mt-2">No files uploaded yet.</div>
                  ) : (
                    <ul className="list-unstyled mb-0">
                      {files.map(f => (
                        <li key={f.name} className="mb-2">
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="link-primary text-break">{f.name}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Link to="/projects" className="text-primary text-decoration-none fw-semibold">&larr; Back to Projects</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
