import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

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
}

interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
  displayName: string;
  sys_admin: boolean;
  managedProjects: Array<{
    id: string;
    name: string;
  }>;
}

export default function EditProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        
        if (!sessionId) {
          throw new Error('No session found');
        }

        // Fetch current user to check permissions
        const userResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/sessions/current`, {
          credentials: 'include', // Include session cookies
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
          },
        });

        if (!userResponse.ok) {
          throw new Error('Failed to fetch user information');
        }

        const userData = await userResponse.json();
        setUser(userData.user);

        // Check if user can manage this project
        const canManage = userData.user.sys_admin || 
                         userData.user.managedProjects.some((p: any) => p.id === projectId);
        
        if (!canManage) {
          throw new Error('You do not have permission to edit this project');
        }

        // Fetch project details
        const projectResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
          credentials: 'include', // Include session cookies
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

      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects/${projectId}`, {
        method: 'PUT',
        credentials: 'include', // Include session cookies
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          public: isPublic
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
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ 
          fontSize: '2rem', 
          marginBottom: '1rem',
          animation: 'spin 1s linear infinite'
        }}>⚙️</div>
        <p>Loading project details...</p>
        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div style={{
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          padding: '1rem',
          margin: '1rem 0'
        }}>
          <h3 style={{ color: '#c33', margin: '0 0 0.5rem 0' }}>Error</h3>
          <p style={{ margin: '0 0 1rem 0', color: '#666' }}>{error}</p>
          <Link 
            to="/projects"
            style={{
              display: 'inline-block',
              backgroundColor: '#3498db',
              color: 'white',
              textDecoration: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px'
            }}
          >
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div>
        <h1>Project not found</h1>
        <Link to="/projects">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link 
          to="/projects"
          style={{
            color: '#3498db',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}
        >
          ← Back to Projects
        </Link>
      </div>

      <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>
        ✏️ Edit Project
      </h1>

      <div style={{
        backgroundColor: 'white',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '600px'
      }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label 
              htmlFor="projectName"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 'bold',
                color: '#2c3e50'
              }}
            >
              Project Name *
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${nameError ? '#dc3545' : '#ced4da'}`,
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box'
              }}
              placeholder="Enter project name"
              disabled={saving}
            />
            {nameError && (
              <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {nameError}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label 
              htmlFor="projectDescription"
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 'bold',
                color: '#2c3e50'
              }}
            >
              Description
            </label>
            <textarea
              id="projectDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '1rem',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              placeholder="Enter project description (optional)"
              disabled={saving}
            />
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 'bold',
                color: '#2c3e50',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={saving}
                style={{
                  width: '1.2rem',
                  height: '1.2rem',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              />
              <span>Public Project</span>
            </label>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#6c757d', 
              marginTop: '0.25rem',
              marginLeft: '1.7rem'
            }}>
              Public projects are visible to all users, including those not logged in
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: saving ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                fontSize: '1rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {saving ? '💾 Saving...' : '💾 Save Changes'}
            </button>

            <Link
              to="/projects"
              style={{
                display: 'inline-block',
                backgroundColor: '#6c757d',
                color: 'white',
                textDecoration: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#e8f4fd',
        border: '1px solid #bee5eb',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#0c5460'
      }}>
        <strong>📝 Note:</strong> Changes will be saved immediately. Make sure all information is correct before saving.
      </div>
    </div>
  );
}