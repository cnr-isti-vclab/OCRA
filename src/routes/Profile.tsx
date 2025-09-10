import { useEffect, useState } from 'react';
import { getCurrentUser } from '../oauth-backend';

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
    <div style={{ padding: 24 }}>
      <h1>Profile</h1>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {info ? (
        <div>
          <ul>
            <li><strong>Name:</strong> {info.name ?? '—'}</li>
            <li><strong>Email:</strong> {info.email ?? '—'}</li>
            <li><strong>OAuth Subject:</strong> {info.sub ?? '—'}</li>
          </ul>
          <div style={{ 
            marginTop: 16, 
            padding: 12, 
            backgroundColor: '#f0f8ff', 
            border: '1px solid #0066cc', 
            borderRadius: 4,
            fontSize: 14 
          }}>
            <strong>🔒 Security Note:</strong> This user data is now stored securely in the database 
            instead of browser sessionStorage. Your access tokens are server-side only!
          </div>
        </div>
      ) : (
        <p>Loading user info…</p>
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
        <a href="/">← Back</a>
        <a href="/audit">🔍 View Audit Log</a>
      </div>
    </div>
  );
}
