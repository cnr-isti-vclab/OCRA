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
  const [info, setInfo] = useState<{ name?: string; email?: string; sub?: string } | null>(null);
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
    <div>
      <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>Profile</h1>
      {error && <p style={{ color: 'crimson', marginBottom: '1rem' }}>Error: {error}</p>}
      {info ? (
        <div>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            marginBottom: '2rem'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#34495e' }}>User Information</h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <strong style={{ color: '#2c3e50' }}>Name:</strong>
                <span style={{ marginLeft: '0.5rem', color: '#555' }}>{info.name ?? 'Not provided'}</span>
              </div>
              <div>
                <strong style={{ color: '#2c3e50' }}>Email:</strong>
                <span style={{ marginLeft: '0.5rem', color: '#555' }}>{info.email ?? 'Not provided'}</span>
              </div>
              <div>
                <strong style={{ color: '#2c3e50' }}>OAuth Subject:</strong>
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontFamily: 'monospace', 
                  fontSize: '0.9rem',
                  color: '#666',
                  backgroundColor: '#f8f9fa',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px'
                }}>
                  {info.sub ?? 'Not provided'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#666' }}>Loading user information...</p>
        </div>
      )}
    </div>
  );
}
