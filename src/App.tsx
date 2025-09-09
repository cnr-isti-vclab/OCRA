import { useEffect, useState } from 'react';
import { getConfig, isReturningFromAuth, completeAuthCodeFlow, loginWithRedirect, logout, getUserInfo, type OAuthTokens } from './oauth';

type User = { name?: string; email?: string };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<OAuthTokens | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On first load, if we have code in URL, finish the PKCE flow; otherwise, check for existing tokens.
  useEffect(() => {
    const init = async () => {
      try {
        if (isReturningFromAuth(window.location)) {
          const t = await completeAuthCodeFlow();
          setTokens(t);
          // Clean the URL (remove code/state) for a nicer UX
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          const stored = sessionStorage.getItem('oauth_tokens');
          if (stored) setTokens(JSON.parse(stored));
        }
        // If we have an access token, fetch user's basic profile (name/email)
        const current = sessionStorage.getItem('oauth_tokens');
        if (current) {
          const { access_token } = JSON.parse(current) as OAuthTokens;
          const info = await getUserInfo(access_token);
          setUser({ name: info.name, email: info.email });
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const cfg = getConfig();

  if (loading) return <Card><p>Loading…</p></Card>;

  if (!tokens) {
    return (
      <Card>
        <h1>React OAuth2 PKCE Demo</h1>
        <p style={{ color: '#555' }}>Provider: {cfg.issuer} | Realm: {cfg.realm} | Client: {cfg.clientId}</p>
        {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
        <button onClick={() => loginWithRedirect()}>Login</button>
      </Card>
    );
  }

  return (
    <Card>
      <h1>Welcome</h1>
      {user ? (
        <p>Signed in as: <strong>{user.name ?? user.email ?? 'Unknown user'}</strong></p>
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
