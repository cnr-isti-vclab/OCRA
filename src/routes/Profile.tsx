import { useEffect, useState } from 'react';
import { getUserInfo, type OAuthTokens } from '../oauth';

/**
 * PROFILE ROUTE COMPONENT
 * 
 * This is a route component - a React component that gets rendered when
 * the user navigates to a specific URL (in this case: /profile).
 * 
 * Route components are just regular React components, but they:
 * 1. Are associated with a URL pattern in the router configuration
 * 2. Get rendered when that URL is accessed
 * 3. Can access route-related information via React Router hooks
 * 4. Handle the specific functionality for that page/view
 * 
 * This component demonstrates a common pattern for protected routes:
 * - It's wrapped by RequireAuth (authentication guard)
 * - It fetches data on mount using the authenticated user's tokens
 * - It displays user-specific information
 */

export default function Profile() {
  const [info, setInfo] = useState<{ name?: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // useEffect runs after component mounts (when user navigates to /profile)
  // This is where we fetch user data using the OAuth access token
  useEffect(() => {
    (async () => {
      try {
        const stored = sessionStorage.getItem('oauth_tokens');
        if (!stored) return; // This should never happen due to RequireAuth guard
        
        const { access_token } = JSON.parse(stored) as OAuthTokens;
        // Call the userinfo endpoint to get user details
        const data = await getUserInfo(access_token);
        setInfo(data);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div style={{ padding: 24 }}>
      <h1>Profile</h1>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {info ? (
        <ul>
          <li><strong>Name:</strong> {info.name ?? '—'}</li>
          <li><strong>Email:</strong> {info.email ?? '—'}</li>
        </ul>
      ) : (
        <p>Loading user info…</p>
      )}
      <p style={{ marginTop: 16 }}>
        {/* Simple navigation back to home - could also use useNavigate() hook */}
        <a href="/">← Back</a>
      </p>
    </div>
  );
}
