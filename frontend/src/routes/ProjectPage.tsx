import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch project');
        }
        const data = await response.json();
        setProject(data.project);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchProject();
  }, [projectId]);

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
    <div style={{ maxWidth: 900, margin: '2rem auto', background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#2c3e50' }}>{project.name}</h1>
        <div style={{ color: '#888', fontWeight: 500, fontSize: '1.1rem' }}>
          Manager: {project.manager ? project.manager.displayName : <span style={{ color: '#e67e22' }}>Unassigned</span>}
        </div>
      </div>
      <div style={{ minHeight: 400, background: '#f4f8fb', border: '2px dashed #b2bec3', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b2bec3', fontSize: '1.5rem' }}>
        [3D Viewer Placeholder]
      </div>
      <div style={{ marginTop: '2rem' }}>
        <Link to="/projects" style={{ color: '#3498db', textDecoration: 'none', fontWeight: 500 }}>&larr; Back to Projects</Link>
      </div>
    </div>
  );
}
