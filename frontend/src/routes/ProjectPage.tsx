import { useEffect, useState } from 'react';
import { getCurrentUser } from '../backend';
import { useParams, Link } from 'react-router-dom';

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
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
  }
  if (error) {
    return <div style={{ color: '#c33', padding: '2rem' }}>Error: {error}</div>;
  }
  if (!project) {
    return <div style={{ padding: '2rem' }}>Project not found</div>;
  }

  return (
    <div style={{ maxWidth: 1100, margin: '2rem auto', background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#2c3e50' }}>{project.name}</h1>
        <div style={{ color: '#888', fontWeight: 500, fontSize: '1.1rem' }}>
          Manager: {project.manager ? project.manager.displayName : <span style={{ color: '#e67e22' }}>Unassigned</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* 3D Viewer Placeholder */}
        <div style={{ flex: 2, minHeight: 400, background: '#f4f8fb', border: '2px dashed #b2bec3', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b2bec3', fontSize: '1.5rem' }}>
          [3D Viewer Placeholder]
        </div>
        {/* File List + Upload */}
        <div style={{ flex: 1, minWidth: 260, background: '#f8fafc', border: '1px solid #e3e8ee', borderRadius: 8, padding: 20 }}>
          <h3 style={{ marginTop: 0, color: '#2c3e50', fontSize: '1.1rem' }}>Project Files</h3>
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
              style={{ marginBottom: 16 }}
            >
              <input type="file" name="file" style={{ marginRight: 8 }} disabled={uploading} />
              <button type="submit" disabled={uploading} style={{ background: '#3498db', color: 'white', border: 'none', borderRadius: 4, padding: '6px 14px', fontWeight: 500, cursor: 'pointer' }}>{uploading ? 'Uploading...' : 'Upload'}</button>
              {uploadError && <div style={{ color: '#c33', marginTop: 6 }}>{uploadError}</div>}
            </form>
          )}
          <div style={{ maxHeight: 350, overflowY: 'auto', borderTop: '1px solid #e3e8ee', paddingTop: 10 }}>
            {files.length === 0 ? (
              <div style={{ color: '#888', fontStyle: 'italic', marginTop: 12 }}>No files uploaded yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {files.map(f => (
                  <li key={f.name} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', textDecoration: 'underline', wordBreak: 'break-all' }}>{f.name}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '2rem' }}>
        <Link to="/projects" style={{ color: '#3498db', textDecoration: 'none', fontWeight: 500 }}>&larr; Back to Projects</Link>
      </div>
    </div>
  );
}
