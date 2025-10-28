import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';

/**
 * HDT (Heritage Digital Twin) Management Page
 *
 * This page allows project managers to manage HDT metadata for their projects.
 * Currently a placeholder page for future HDT functionality.
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

export default function HDTPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;

      try {
        setLoading(true);
        const response = await fetch(`${getApiBase()}/api/projects/${projectId}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch project: ${response.status}`);
        }

        const data = await response.json();
        setProject(data);
      } catch (e: any) {
        console.error('Failed to fetch project:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="display-4 mb-3 spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted">Loading HDT management...</p>
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
    <div className="container py-5">
      <div className="d-flex align-items-center mb-4">
        <Link to={`/projects/${projectId}`} className="btn btn-outline-secondary me-3">
          ← Back to Project
        </Link>
        <div>
          <h1 className="h3 mb-0">🏛️ HDT Management</h1>
          <p className="text-muted mb-0">Heritage Digital Twin metadata for: <strong>{project.name}</strong></p>
        </div>
      </div>

      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">HDT Metadata Configuration</h5>
            </div>
            <div className="card-body">
              <div className="alert alert-info">
                <h6 className="alert-heading">🚧 Coming Soon</h6>
                <p className="mb-0">
                  This page will allow you to configure Heritage Digital Twin metadata including:
                </p>
                <ul className="mb-0 mt-2">
                  <li>Dublin Core metadata (title, description, creator, etc.)</li>
                  <li>CIDOC-CRM cultural heritage properties</li>
                  <li>Getty AAT controlled vocabularies</li>
                  <li>Location and time period information</li>
                  <li>License and access rights</li>
                  <li>RDF export configuration</li>
                </ul>
              </div>

              <div className="text-center py-5">
                <div className="display-1 mb-3">🏗️</div>
                <h4 className="text-muted">Under Construction</h4>
                <p className="text-muted">
                  HDT metadata management features are being developed.
                  Check back soon for enhanced cultural heritage metadata capabilities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}