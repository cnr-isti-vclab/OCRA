import { useEffect, useState } from 'react';
import { getUserInfo, type OAuthTokens } from '../oauth';

export default function Profile() {
  const [info, setInfo] = useState<{ name?: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = sessionStorage.getItem('oauth_tokens');
        if (!stored) return; // guarded by RequireAuth
        const { access_token } = JSON.parse(stored) as OAuthTokens;
        const data = await getUserInfo(access_token);
        setInfo(data);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

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
        <a href="/">← Back</a>
      </p>
    </div>
  );
}
