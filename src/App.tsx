import { useEffect, useState } from 'react';
import { startAuthFlow, completeAuthCodeFlow, logout, getCurrentUser, OAUTH_CONFIG } from './backend';

type User = { name?: string; email?: string; sub: string };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On first load, if we have code in URL, finish the PKCE flow; otherwise, check for existing session.
  useEffect(() => {
    const init = async () => {
      try {
        // Check if we're returning from OAuth provider (code in URL)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('code')) {
          // Complete OAuth flow and get session
          await completeAuthCodeFlow();
          
          // Get the user after session is created
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            setUser({
              sub: currentUser.sub,
              name: currentUser.name,
              email: currentUser.email,
            });
          }
        } else {
          // Check if we have an existing valid session
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            setUser(currentUser);
          }
        }
      } catch (e: any) {
        console.error('Authentication error:', e);
        setError(e?.message ?? String(e));
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) return <Card><p>Loading…</p></Card>;

  if (!isAuthenticated) {
    return (
      <Card>
        <h1>React OAuth2 PKCE Demo with Backend API</h1>
        <p style={{ color: '#555' }}>Provider: {OAUTH_CONFIG.issuer} | Client: {OAUTH_CONFIG.clientId}</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
          🔒 Now with <strong>backend API session storage</strong> for production-ready security!
        </p>
        {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
        <button onClick={() => startAuthFlow()}>Login</button>
      </Card>
    );
  }

  return (
    <Card>
      <h1>Welcome</h1>
      {user ? (
        <div>
          <p>Signed in as: <strong>{user.name ?? user.email ?? 'Unknown user'}</strong></p>
          <p style={{ fontSize: 12, color: '#666' }}>Session stored via backend API • Sub: {user.sub}</p>
        </div>
      ) : (
        <p>Signed in. (No profile info)</p>
      )}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/profile">Profile</a>
        <a href="/audit">Audit Log</a>
        <button onClick={() => logout().then(() => window.location.reload())}>Logout</button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.08)', width: 520, maxWidth: '90vw' }}>
      {children}
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <p style={{ marginTop: 24, color: '#777', fontSize: 12 }}>
      This demo shows the Authorization Code Flow with PKCE using a minimal, annotated React setup.
    </p>
  );
}
