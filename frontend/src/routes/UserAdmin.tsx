import 'bootstrap/dist/css/bootstrap.min.css';
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
      <div className="container py-5">
        <h1 className="mb-4 text-dark">User Administration</h1>
        <div className="card p-4 text-center text-muted">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <h1 className="mb-4 text-dark">User Administration</h1>
        <div className="alert alert-danger mb-3">Error: {error}</div>
        <button onClick={fetchUsers} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <h1 className="mb-4 text-dark">User Administration</h1>
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light">
          <h2 className="h6 mb-0 text-secondary">All Users ({users.length})</h2>
        </div>
        {users.length === 0 ? (
          <div className="card-body text-center text-muted">No users found.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th className="text-center">Admin</th>
                  <th className="text-center">Managed Projects</th>
                  <th>Last Login</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="fw-semibold text-dark">{getDisplayName(user)}</td>
                    <td className="text-secondary">{user.email || 'N/A'}</td>
                    <td className="text-secondary">{user.username || 'N/A'}</td>
                    <td className="text-center">
                      <span className={`badge ${user.sys_admin ? 'bg-success' : 'bg-secondary'}`}>{user.sys_admin ? 'Yes' : 'No'}</span>
                    </td>
                    <td className="text-center">
                      <span className={`badge ${user.managedProjectsCount ? 'bg-info text-dark' : 'bg-secondary'}`}>{user.managedProjectsCount || 0}</span>
                    </td>
                    <td className={user.lastLoginAt ? '' : 'text-danger'}>{formatLastLogin(user.lastLoginAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
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
