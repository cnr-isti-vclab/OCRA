import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * PROJECTS COMPONENT
 * 
 * This component displays the list of projects in the system.
 * It fetches project data from the backend API and presents it
 * in a user-friendly format.
 * 
 * Features:
 * - Shows all projects with their details
 * - Loading states and error handling
 * - Responsive card-based layout
 * - Project creation/editing (future enhancement)
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

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        
        if (!sessionId) {
          throw new Error('No session found');
        }

        // Fetch current user information
        const userResponse = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/sessions/current`, {
          credentials: 'include', // Include session cookies
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json',
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData.user);
        }

        // Fetch projects
        const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:3002'}/api/projects`, {
          credentials: 'include', // Include session cookies
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }

        const data = await response.json();
        setProjects(data.projects || data || []);
      } catch (e: any) {
        console.error('Failed to fetch data:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Check if current user can edit a specific project
  const canEditProject = (projectId: string): boolean => {
    if (!user) return false;
    if (user.sys_admin) return true;
    return user.managedProjects.some(p => p.id === projectId);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{ 
          fontSize: '2rem', 
          marginBottom: '1rem',
          animation: 'spin 1s linear infinite'
        }}>⚙️</div>
        <p>Loading projects...</p>
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
      <div style={{
        backgroundColor: '#fee',
        border: '1px solid #fcc',
        borderRadius: '8px',
        padding: '1rem',
        margin: '1rem 0'
      }}>
        <h3 style={{ color: '#c33', margin: '0 0 0.5rem 0' }}>Error Loading Projects</h3>
        <p style={{ margin: 0, color: '#666' }}>{error}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>
        📁 Projects
      </h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ color: '#666', margin: 0 }}>
          Manage and view all projects in the system.
        </p>
      </div>

      {projects.length === 0 ? (
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '3rem',
          textAlign: 'center',
          color: '#6c757d'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
          <h3 style={{ margin: '0 0 1rem 0' }}>No Projects Found</h3>
          <p style={{ margin: 0 }}>
            No projects have been created yet. Contact an administrator to add projects.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem'
        }}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                padding: '1rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'box-shadow 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '0.75rem'
              }}>
                <h3 style={{ 
                  margin: '0', 
                  color: '#2c3e50',
                  fontSize: '1.1rem',
                  flex: '1'
                }}>
                  {project.name}
                </h3>
                {!project.public && (
                  <span style={{
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    marginLeft: '0.5rem'
                  }}>
                    🔒 Private
                  </span>
                )}
              </div>
              
              {project.description && (
                <p style={{ 
                  margin: '0 0 0.75rem 0', 
                  color: '#666',
                  lineHeight: '1.4',
                  fontSize: '0.9rem'
                }}>
                  {project.description}
                </p>
              )}
              
              {project.manager && (
                <div style={{
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.85rem',
                  color: '#495057',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <span style={{ marginRight: '0.5rem' }}>👨‍💼</span>
                  <span style={{ fontWeight: '500' }}>Manager:</span>
                  <span style={{ marginLeft: '0.5rem', color: '#6c757d' }}>
                    {project.manager.displayName}
                  </span>
                </div>
              )}
              
              {!project.manager && (
                <div style={{
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffeaa7',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.85rem',
                  color: '#856404',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <span style={{ marginRight: '0.5rem' }}>⚠️</span>
                  <span style={{ fontWeight: '500' }}>No manager assigned</span>
                </div>
              )}
              
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#999',
                borderTop: '1px solid #eee',
                paddingTop: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <strong>Created:</strong> {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    <strong>Updated:</strong> {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                
                {canEditProject(project.id) && (
                  <Link
                    to={`/projects/${project.id}/edit`}
                    style={{
                      backgroundColor: '#3498db',
                      color: 'white',
                      textDecoration: 'none',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      transition: 'background-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2980b9';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#3498db';
                    }}
                  >
                    ✏️ Edit
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#e8f4fd',
        border: '1px solid #bee5eb',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#0c5460'
      }}>
        <strong>💡 Future Enhancements:</strong>
        <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
          <li>Project creation and editing</li>
          <li>User assignments to projects</li>
          <li>Project-specific permissions</li>
          <li>File uploads and management</li>
        </ul>
      </div>
    </div>
  );
}