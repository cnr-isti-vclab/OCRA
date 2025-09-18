import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthFlow, completeAuthCodeFlow, logout, getCurrentUser, OAUTH_CONFIG } from './backend';

type User = { name?: string; email?: string; sub: string };

export default function App() {
  const navigate = useNavigate();
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
            // Redirect to profile page after successful login
            navigate('/profile');
          }
        } else {
          // Check if we have an existing valid session
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            setUser(currentUser);
            // Redirect to profile page if already authenticated
            navigate('/profile');
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

  if (loading) return <Card><div className="text-center py-4"><div className="spinner-border text-primary mb-3" role="status"><span className="visually-hidden">Loading...</span></div><p className="text-muted">Loading…</p></div></Card>;

  if (!isAuthenticated) {
    return (
      <Card>
        <h1 className="mb-3">OCRA a Collaborative 3D Annotation Platform</h1>
        <p className="text-muted mb-2">
          OCRA is an online platform for collaborative annotation and management of 3D assets, designed for conservation-restoration and heritage science workflows.
        </p>
        <p className="text-secondary mb-2">Provider: {OAUTH_CONFIG.issuer} | Client: {OAUTH_CONFIG.clientId}</p>
        {error && <p className="text-danger">Error: {error}</p>}
        <button className="btn btn-primary fw-bold px-4" onClick={() => startAuthFlow()}>Login</button>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-3">Welcome</h1>
      {user ? (
        <div>
          <p>Signed in as: <strong>{user.name ?? user.email ?? 'Unknown user'}</strong></p>
          <p className="text-muted small mb-3">Session stored via backend API • Sub: {user.sub}</p>
          <p className="mt-3">
            <a href="/profile" className="btn btn-success fw-bold px-4">
              Go to Dashboard →
            </a>
          </p>
        </div>
      ) : (
        <p>Signed in. (No profile info)</p>
      )}
      {error && <p className="text-danger">Error: {error}</p>}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-4 shadow p-4 mx-auto my-5" style={{ maxWidth: 520, width: '100%' }}>
      {children}
    </div>
  );
}
