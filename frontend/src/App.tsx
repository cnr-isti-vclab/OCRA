import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startAuthFlow,
  completeAuthCodeFlow,
  createSessionFromAuthResult,
  getCurrentUser,
  OAUTH_CONFIG,
  probeExistingProviderSession,
  relaySilentAuthCallbackToParent
} from './backend';
import { releases, type Release } from './data/releases';
import type { OAuthUserProfile } from 'shared/types';

function getContinueLabel(profile: OAuthUserProfile): string {
  const identity = profile.username ?? profile.preferred_username ?? profile.name ?? profile.email;
  return identity ? `Continue as ${identity}` : 'Continue';
}

export default function App() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [providerUserLabel, setProviderUserLabel] = useState<string | null>(null);
  const [continueAuthReady, setContinueAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (relaySilentAuthCallbackToParent()) {
        setLoading(false);
        return;
      }

      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('code')) {
          await completeAuthCodeFlow();
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            navigate('/projects');
          }
        } else {
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            navigate('/projects');
          } else {
            const providerSession = await probeExistingProviderSession();
            if (providerSession) {
              setProviderUserLabel(getContinueLabel(providerSession.userProfile));
              setContinueAuthReady(true);
            }
          }
        }
      } catch (e: unknown) {
        console.error('Authentication error:', e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]);

  const handleLoginAction = async () => {
    setError(null);

    if (!continueAuthReady) {
      await startAuthFlow();
      return;
    }

    try {
      const providerSession = await probeExistingProviderSession();
      if (!providerSession) {
        setContinueAuthReady(false);
        setProviderUserLabel(null);
        await startAuthFlow();
        return;
      }

      const currentUser = await createSessionFromAuthResult(providerSession);
      setIsAuthenticated(true);
      navigate('/projects');
    } catch (e: unknown) {
      console.error('Continue login failed:', e);
      setContinueAuthReady(false);
      setProviderUserLabel(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return (
      <LandingBackground>
        <LoginCard>
          <div className="text-center py-4">
            <div className="spinner-border mb-3" style={{ color: '#1a3f6b' }} role="status">
              <span className="visually-hidden">Loading…</span>
            </div>
            <p className="text-muted mb-0">Loading…</p>
          </div>
        </LoginCard>
      </LandingBackground>
    );
  }

  if (!isAuthenticated) {
    return (
      <LandingBackground>
        <LoginCard>
          {/* OCRA logo — centered, prominent */}
          <div className="text-center mb-3">
            <img src="/ocra-logo.png" alt="OCRA" style={{ height: 96 }} />
          </div>

          {/* Title & description */}
          <h1 className="fw-bold text-center mb-1" style={{ fontSize: '1.6rem', color: '#0f2d52' }}>
            OCRA
          </h1>
          <p className="text-center mb-1" style={{ fontSize: '1rem', color: '#1a3f6b', fontWeight: 500 }}>
            Online Conservation-Restoration Annotator
          </p>
          <p className="text-muted text-center mb-4" style={{ fontSize: '0.875rem', lineHeight: 1.55 }}>
            OCRA is a collaborative platform for annotating and semantically enriching 2D and 3D cultural heritage assets in the browser. Designed for conservation-restoration workflows, it connects digital representations with the ECCCH Knowledge Base and Heritage Digital Twins
          </p>

          {/* Error banner */}
          {error && (
            <div className="alert alert-danger py-2 mb-3 small" role="alert">
              {error}
            </div>
          )}

          {/* Login */}
          <button
            className="btn w-100 fw-semibold py-2 mb-2"
            style={{ backgroundColor: '#1a3f6b', color: '#fff', borderRadius: '0.5rem' }}
            onClick={() => void handleLoginAction()}
          >
            {providerUserLabel ?? 'Sign in'}
          </button>
          <p className="text-center text-muted mb-4" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
            via {OAUTH_CONFIG.issuer}
          </p>

          {/* Release notes */}
          <hr className="my-3" />
          {/* ECHOES attribution */}
          <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>Part of the</span>
            <a href="https://www.echoes-eccch.eu/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center' }}>
              <img src="/echoes-logo.png" alt="ECHOES project" style={{ height: 18, opacity: 0.75 }} />
            </a>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>project</span>
          </div>
          <hr className="my-3" />
          <p
            className="mb-2 fw-semibold"
            style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6c757d' }}
          >
            What's new
          </p>
          {releases.map((release, idx) => (
            <ReleaseEntry key={release.version} release={release} defaultOpen={idx === 0} />
          ))}
        </LoginCard>
      </LandingBackground>
    );
  }

  console.error('Unexpected state: authenticated user not redirected');
  return (
    <LandingBackground>
      <LoginCard>
        <div className="text-center text-danger py-3">
          <h2 className="h5">Unexpected Error</h2>
          <p className="small mb-0">Please refresh the page.</p>
        </div>
      </LoginCard>
    </LandingBackground>
  );
}

/* ── Layout shells ── */

function LandingBackground({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        // Deep navy gradient — swap for a background-image URL if a hero photo is available
        background: 'linear-gradient(140deg, #091d35 0%, #0f3460 55%, #1a1a2e 100%)',
      }}
    >
      {children}
    </div>
  );
}

function LoginCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.97)',
        borderRadius: '1rem',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
        padding: '2rem 2.25rem',
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
}

/* ── Release notes accordion entry ── */

function ReleaseEntry({ release, defaultOpen }: { release: Release; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-1 border rounded overflow-hidden" style={{ fontSize: '0.84rem' }}>
      <button
        className="btn btn-link w-100 text-start py-2 px-3 d-flex justify-content-between align-items-center text-decoration-none"
        style={{ color: '#0f2d52' }}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>
          <strong>v{release.version}</strong>
          <span className="text-muted ms-2" style={{ fontSize: '0.78rem' }}>{release.date}</span>
        </span>
        <span style={{ fontSize: '0.65rem', color: '#adb5bd', lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="mb-0 pb-2 ps-4 pe-3" style={{ color: '#495057', lineHeight: 1.6 }}>
          {release.highlights.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
