import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { getApiBase } from '../config/oauth';

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
  sys_creator?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  managedProjectsCount?: number;
}

export default function UserAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [filterCreator, setFilterCreator] = useState<'all' | 'creators' | 'non-creators'>('all');
  const [sortCreatorAsc, setSortCreatorAsc] = useState<boolean | null>(null); // null = no sort, true = asc, false = desc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${getApiBase()}/api/users/stats`, {
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

  // Derived list applying filter and sort
  const displayedUsers = users
    .filter((u) => {
      if (filterCreator === 'all') return true;
      if (filterCreator === 'creators') return !!u.sys_creator;
      return !u.sys_creator;
    })
    .sort((a, b) => {
      if (sortCreatorAsc === null) return 0;
      const av = a.sys_creator ? 1 : 0;
      const bv = b.sys_creator ? 1 : 0;
      return sortCreatorAsc ? av - bv : bv - av;
    });

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
        {displayedUsers.length === 0 ? (
          <div className="card-body text-center text-muted">No users found.</div>
        ) : (
          <div className="table-responsive">
            <div className="d-flex align-items-center justify-content-between p-2">
              <div>
                <div className="btn-group" role="group" aria-label="Creator filter">
                  <button type="button" className={`btn btn-sm ${filterCreator === 'all' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFilterCreator('all')}>All</button>
                  <button type="button" className={`btn btn-sm ${filterCreator === 'creators' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFilterCreator('creators')}>Creators</button>
                  <button type="button" className={`btn btn-sm ${filterCreator === 'non-creators' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setFilterCreator('non-creators')}>Non-creators</button>
                </div>
              </div>
              <div className="text-muted small">Showing {displayedUsers.length} of {users.length}</div>
            </div>
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th className="text-center">Admin</th>
                  <th className="text-center" style={{cursor: 'pointer'}} onClick={() => setSortCreatorAsc(sortCreatorAsc === null ? false : sortCreatorAsc ? false : null)}>
                    Creator
                    {sortCreatorAsc === null ? null : (
                      <span className="ms-2">{sortCreatorAsc ? '▲' : '▼'}</span>
                    )}
                  </th>
                  <th className="text-center">Managed Projects</th>
                  <th>Last Login</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="fw-semibold text-dark">{getDisplayName(user)}</td>
                      <td className="text-secondary">{user.email || 'N/A'}</td>
                      <td className="text-secondary">{user.username || 'N/A'}</td>
                      <td className="text-center">
                        <span className={`badge ${user.sys_admin ? 'bg-success' : 'bg-secondary'}`}>{user.sys_admin ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${user.sys_creator ? 'bg-primary' : 'bg-secondary'}`}>{user.sys_creator ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${user.managedProjectsCount ? 'bg-info text-dark' : 'bg-secondary'}`}>{user.managedProjectsCount || 0}</span>
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
