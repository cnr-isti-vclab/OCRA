import { useEffect, useState } from 'react';
import { getConfig, isReturningFromAuth, completeAuthCodeFlow, loginWithRedirect, logout, getCurrentUser, isLoggedIn } from './oauth';

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
        if (isReturningFromAuth(window.location)) {
          // Complete OAuth flow and get session
          const { sessionId, userProfile } = await completeAuthCodeFlow();
          console.log('OAuth flow completed, session created:', sessionId);
          
          setIsAuthenticated(true);
          setUser({
            sub: userProfile.sub,
            name: userProfile.name,
            email: userProfile.email,
          });
          
          // Clean the URL (remove code/state) for a nicer UX
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // Check if we have an existing valid session
          const loggedIn = await isLoggedIn();
          setIsAuthenticated(loggedIn);
          
          if (loggedIn) {
            const currentUser = await getCurrentUser();
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

  const cfg = getConfig();

  if (loading) return <Card><p>Loading…</p></Card>;

  if (!isAuthenticated) {
    return (
      <Card>
        <h1>React OAuth2 PKCE Demo</h1>
        <p style={{ color: '#555' }}>Provider: {cfg.issuer} | Realm: {cfg.realm} | Client: {cfg.clientId}</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>
          🔒 Now with <strong>database session storage</strong> instead of browser sessionStorage for improved security!
        </p>
        {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
        <button onClick={() => loginWithRedirect()}>Login</button>
      </Card>
    );
  }

  return (
    <Card>
      <h1>Welcome</h1>
      {user ? (
        <div>
          <p>Signed in as: <strong>{user.name ?? user.email ?? 'Unknown user'}</strong></p>
          <p style={{ fontSize: 12, color: '#666' }}>Session stored in database • Sub: {user.sub}</p>
        </div>
      ) : (
        <p>Signed in. (No profile info)</p>
      )}
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/profile">Profile</a>
        <button onClick={() => logout()}>Logout</button>
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
