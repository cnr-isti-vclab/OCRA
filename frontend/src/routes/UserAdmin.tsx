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
  id: string;  // Changed from number to string (cuid)
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
  hasActiveSession?: boolean;
}

export default function UserAdmin() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [filterCreator, setFilterCreator] = useState<'all' | 'creators' | 'non-creators'>('all');
  const [sortCreatorAsc, setSortCreatorAsc] = useState<boolean | null>(null); // null = no sort, true = asc, false = desc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addName, setAddName] = useState('');
  const [addCreator, setAddCreator] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      console.log('Fetching current user...');
      const url = `${getApiBase()}/api/sessions/current`;
      console.log('URL:', url);
      
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      console.log('Current user response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Current user response data:', data);
        // The API returns { success: true, user: { ... } }
        const userData = data.user || data;
        console.log('Extracted user data:', userData);
        setCurrentUser(userData);
      } else {
        console.error('Failed to fetch current user:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

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

  const toggleCreatorPrivilege = async (user: User) => {
    console.log('toggleCreatorPrivilege called for user:', user.id, user.email);
    console.log('currentUser:', currentUser);
    console.log('currentUser?.sys_admin:', currentUser?.sys_admin);
    
    if (!currentUser?.sys_admin) {
      console.log('User is not admin, showing alert');
      alert('Only administrators can change user privileges');
      return;
    }

    if (updatingUserId === user.id) {
      console.log('Already updating this user, ignoring click');
      return; // Already updating this user
    }

    const newCreatorStatus = !user.sys_creator;
    const confirmMessage = newCreatorStatus
      ? `Grant creator privilege to ${getDisplayName(user)}?`
      : `Revoke creator privilege from ${getDisplayName(user)}?`;

    console.log('Showing confirmation dialog:', confirmMessage);
    if (!confirm(confirmMessage)) {
      console.log('User cancelled the confirmation');
      return;
    }

    console.log('Setting updatingUserId to:', user.id);
    setUpdatingUserId(user.id);

    try {
      const url = `${getApiBase()}/api/admin/users/${user.id}/privileges`;
      console.log('Calling API:', url);
      console.log('Request body:', { sys_creator: newCreatorStatus });
      
      const response = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sys_creator: newCreatorStatus,
        }),
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error response:', errorData);
        throw new Error(errorData.error || `Failed to update privilege: ${response.status}`);
      }

      const result = await response.json();
      console.log('API success response:', result);

      // Update the user in the local state
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === user.id ? { ...u, sys_creator: result.user.sys_creator } : u
        )
      );

      console.log('Creator privilege updated successfully');
    } catch (error: any) {
      console.error('Error updating creator privilege:', error);
      alert(`Failed to update privilege: ${error.message}`);
    } finally {
      console.log('Clearing updatingUserId');
      setUpdatingUserId(null);
    }
  };

  const addUser = async () => {
    const trimmedEmail = addEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setAddError('Email is required');
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      const response = await fetch(`${getApiBase()}/api/admin/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: addName.trim() || undefined,
          sys_creator: addCreator,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${response.status}`);
      }
      setShowAddModal(false);
      setAddEmail('');
      setAddName('');
      setAddCreator(false);
      fetchUsers();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
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
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h1 className="mb-0 text-dark">User Administration</h1>
        {currentUser?.sys_admin && (
          <button className="btn btn-primary" onClick={() => { setAddError(null); setShowAddModal(true); }}>
            + Add User
          </button>
        )}
      </div>

      {/* Add User modal */}
      {showAddModal && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add User</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)} />
              </div>
              <div className="modal-body">
                <p className="text-muted small mb-3">
                  Pre-register a user by email. Their account will be fully activated the first time they sign in via the identity provider.
                </p>
                {addError && <div className="alert alert-danger py-2 small">{addError}</div>}
                <div className="mb-3">
                  <label className="form-label fw-semibold">Email <span className="text-danger">*</span></label>
                  <input
                    type="email"
                    className="form-control"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addUser()}
                    placeholder="user@example.com"
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Display name <span className="text-muted fw-normal">(optional)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="add-creator"
                    checked={addCreator}
                    onChange={e => setAddCreator(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="add-creator">
                    Grant creator privilege (can create projects)
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addUser} disabled={addLoading}>
                  {addLoading ? 'Adding…' : 'Add User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-light">
          <h2 className="h6 mb-0 text-secondary">All Users ({users.length})</h2>
        </div>
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
        {displayedUsers.length === 0 ? (
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
                    <td className="fw-semibold text-dark">
                        <span
                          title={user.hasActiveSession ? 'Currently logged in' : 'Not logged in'}
                          style={{
                            display: 'inline-block',
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            backgroundColor: user.hasActiveSession ? '#28a745' : '#ced4da',
                            marginRight: 7,
                            flexShrink: 0,
                            verticalAlign: 'middle',
                          }}
                        />
                        {getDisplayName(user)}
                      </td>
                      <td className="text-secondary">{user.email || 'N/A'}</td>
                      <td className="text-secondary">{user.username || 'N/A'}</td>
                      <td className="text-center">
                        <span className={`badge ${user.sys_admin ? 'bg-success' : 'bg-secondary'}`}>{user.sys_admin ? 'Yes' : 'No'}</span>
                      </td>
                      <td className="text-center">
                        <span 
                          className={`badge ${user.sys_creator ? 'bg-primary' : 'bg-secondary'} ${currentUser?.sys_admin ? 'cursor-pointer' : ''}`}
                          style={currentUser?.sys_admin ? { cursor: 'pointer', userSelect: 'none' } : {}}
                          onClick={(e) => {
                            console.log('Badge clicked!', { userId: user.id, isAdmin: currentUser?.sys_admin });
                            e.stopPropagation();
                            if (currentUser?.sys_admin) {
                              toggleCreatorPrivilege(user);
                            } else {
                              console.log('Not admin, click ignored');
                            }
                          }}
                          title={currentUser?.sys_admin ? 'Click to toggle creator privilege' : ''}
                        >
                          {updatingUserId === user.id ? '...' : (user.sys_creator ? 'Yes' : 'No')}
                        </span>
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
