import { useEffect, useState } from 'react';

/**
 * USER ADMIN ROUTE COMPONENT
 * 
 * This component displays a list of all users in the system.
 * It's intended for system administrators to view and manage users.
 */

interface User {
  id: number;
  sub: string;
  email: string;
  name?: string;
  username?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
  sys_admin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  managedProjectsCount?: number;
}

export default function UserAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users/stats', {
        credentials: 'include',
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error('API Response:', response.status, responseText);
        throw new Error(`Failed to fetch users: ${response.status} - ${responseText}`);
      }

      const userData = await response.json();
      setUsers(userData);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setError(error.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLastLogin = (dateString: string | null | undefined) => {
    if (!dateString) return 'Never';
    return formatDate(dateString);
  };

  const getDisplayName = (user: User) => {
    if (user.name) return user.name;
    if (user.given_name || user.family_name) {
      return [user.given_name, user.middle_name, user.family_name].filter(Boolean).join(' ');
    }
    return user.username || user.email || 'Unknown';
  };

  if (loading) {
    return (
      <div>
        <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>User Administration</h1>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#666' }}>Loading users...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>User Administration</h1>
        <div style={{
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <p style={{ margin: 0, color: '#c33' }}>Error: {error}</p>
        </div>
        <button
          onClick={fetchUsers}
          style={{
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>User Administration</h1>
      
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #eee',
          backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#34495e' }}>
            All Users ({users.length})
          </h2>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            No users found.
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#495057' }}>
                    Name
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#495057' }}>
                    Email
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#495057' }}>
                    Username
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#495057' }}>
                    Admin
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#495057' }}>
                    Managed Projects
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#495057' }}>
                    Last Login
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#495057' }}>
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: '1px solid #dee2e6',
                      backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa'
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '500', color: '#2c3e50' }}>
                        {getDisplayName(user)}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', color: '#6c757d' }}>
                      {user.email || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', color: '#6c757d' }}>
                      {user.username || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        backgroundColor: user.sys_admin ? '#d4edda' : '#f8f9fa',
                        color: user.sys_admin ? '#155724' : '#6c757d'
                      }}>
                        {user.sys_admin ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        backgroundColor: (user.managedProjectsCount || 0) > 0 ? '#e3f2fd' : '#f8f9fa',
                        color: (user.managedProjectsCount || 0) > 0 ? '#1565c0' : '#6c757d'
                      }}>
                        {user.managedProjectsCount || 0}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#6c757d', fontSize: '0.9rem' }}>
                      <span style={{
                        color: user.lastLoginAt ? '#495057' : '#dc3545'
                      }}>
                        {formatLastLogin(user.lastLoginAt)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', color: '#6c757d', fontSize: '0.9rem' }}>
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
