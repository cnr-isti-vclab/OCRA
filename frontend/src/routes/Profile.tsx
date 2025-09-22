import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../backend';

/**
 * PROFILE ROUTE COMPONENT (Updated for Backend API)
 * 
 * This is a route component - a React component that gets rendered when
 * the user navigates to a specific URL (in this case: /profile).
 * 
 * BACKEND API INTEGRATION:
 * - Now fetches user data from backend API session endpoint
 * - Better security (tokens stored server-side only)
 * - Data is validated and served by backend database
 * - Session management handled by dedicated API service
 * 
 * Route components are just regular React components, but they:
 * 1. Are associated with a URL pattern in the router configuration
 * 2. Get rendered when that URL is accessed
 * 3. Can access route-related information via React Router hooks
 * 4. Handle the specific functionality for that page/view
 * 
 * This component demonstrates a common pattern for protected routes:
 * - It's wrapped by RequireAuth (authentication guard)
 * - It fetches data on mount using the backend API
 * - It displays user-specific information from the session
 */

export default function Profile() {
  const [info, setInfo] = useState<{ 
    name?: string; 
    email?: string; 
    sub?: string;
    username?: string;
    given_name?: string;
    family_name?: string;
    middle_name?: string;
    sys_admin?: boolean;
    sys_creator?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useEffect runs after component mounts (when user navigates to /profile)
  // This is where we fetch user data from the database session
  useEffect(() => {
    (async () => {
      try {
        // Get current user from database session (no API call needed!)
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setInfo(currentUser);
        } else {
          // This shouldn't happen due to RequireAuth guard, but handle gracefully
          setError('No user session found');
        }
      } catch (e: any) {
        console.error('Failed to get current user:', e);
        setError(e?.message ?? String(e));
      }
    })();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div className="container py-5">
      <h1 className="mb-4 text-dark">Profile</h1>
      {error && <div className="alert alert-danger">Error: {error}</div>}
      {info ? (
        <div className="card shadow-sm mb-4" style={{ maxWidth: 500 }}>
          <div className="card-body">
            <h2 className="h5 mb-3 text-secondary">User Information</h2>
            <ul className="list-group list-group-flush">
              <li className="list-group-item">
                <strong>Display Name:</strong> <span>{info.name ?? 'Not provided'}</span>
              </li>
              {info.username && (
                <li className="list-group-item">
                  <strong>Username:</strong> <span className="badge bg-info text-dark ms-2">{info.username}</span>
                </li>
              )}
              {(info.given_name || info.family_name || info.middle_name) && (
                <li className="list-group-item">
                  <strong>Login Name Components:</strong>
                  <ul className="mb-0 ps-3">
                    {info.given_name && (
                      <li><span className="text-muted">First:</span> {info.given_name}</li>
                    )}
                    {info.middle_name && (
                      <li><span className="text-muted">Middle:</span> {info.middle_name}</li>
                    )}
                    {info.family_name && (
                      <li><span className="text-muted">Last:</span> {info.family_name}</li>
                    )}
                  </ul>
                </li>
              )}
              <li className="list-group-item">
                <strong>Email:</strong> <span>{info.email ?? 'Not provided'}</span>
              </li>
              <li className="list-group-item">
                <strong>OAuth Subject:</strong> <span className="text-monospace ms-2">{info.sub ?? 'Not provided'}</span>
              </li>
              <li className="list-group-item">
                <strong>Admin Status:</strong> <span className={`badge ms-2 ${info.sys_admin ? 'bg-success' : 'bg-secondary'}`}>{info.sys_admin ? 'System Administrator' : 'Regular User'}</span>
              </li>
                <li className="list-group-item">
                  <strong>Creator Privilege:</strong> <span className={`badge ms-2 ${info.sys_creator ? 'bg-primary' : 'bg-secondary'}`}>{info.sys_creator ? 'Creator' : 'No'}</span>
                </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="card p-4 text-center text-muted">Loading user information...</div>
      )}
    </div>
  );
}
