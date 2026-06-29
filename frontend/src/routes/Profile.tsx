import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../backend';
import {
  fetchEchoesHdts,
  clearEchoesDevBearer,
  registerEchoesDevBearer,
  unregisterEchoesDigitalTwin,
} from '../services/EchoesApi';
import type { EchoesHdtListItem } from '../types';
import EchoesHdtListWidget from '../shared/ui/EchoesHdtListWidget';

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
  type CurrentUserInfo = Awaited<ReturnType<typeof getCurrentUser>>;
  type OperationFeedback = {
    kind: 'success' | 'error';
    text: string;
  };

  const [info, setInfo] = useState<CurrentUserInfo>(null);
  const [error, setError] = useState<string | null>(null);
  const [echoesBearer, setEchoesBearer] = useState('');
  const [echoesBearerBusy, setEchoesBearerBusy] = useState(false);
  const [echoesBearerMessage, setEchoesBearerMessage] = useState<string | null>(null);
  const [echoesHdtItems, setEchoesHdtItems] = useState<EchoesHdtListItem[]>([]);
  const [echoesHdtListVisible, setEchoesHdtListVisible] = useState(false);
  const [echoesHdtListLoading, setEchoesHdtListLoading] = useState(false);
  const [echoesHdtListError, setEchoesHdtListError] = useState<string | null>(null);
  const [echoesUnregisterUri, setEchoesUnregisterUri] = useState('');
  const [echoesUnregisterBusy, setEchoesUnregisterBusy] = useState(false);
  const [echoesUnregisterFeedback, setEchoesUnregisterFeedback] = useState<OperationFeedback | null>(null);

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
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : 'Failed to get current user.');
      }
    })();
  }, []); // Empty dependency array means this runs once on mount

  async function loadEchoesHdtList(): Promise<void> {
    try {
      setEchoesHdtListLoading(true);
      setEchoesHdtListError(null);
      const items = await fetchEchoesHdts('');
      setEchoesHdtItems(items);
      setEchoesHdtListVisible(true);
    } catch (error: unknown) {
      setEchoesHdtItems([]);
      setEchoesHdtListVisible(true);
      setEchoesHdtListError(error instanceof Error ? error.message : 'Failed to list registered ECCCH HDTs.');
    } finally {
      setEchoesHdtListLoading(false);
    }
  }

  async function saveEchoesBearerOverride(): Promise<void> {
    const trimmedBearer = echoesBearer.trim();
    if (!trimmedBearer) {
      setEchoesBearerMessage('Paste a bearer token before saving it.');
      return;
    }

    try {
      setEchoesBearerBusy(true);
      setEchoesBearerMessage(null);
      await registerEchoesDevBearer({
        bearer: trimmedBearer,
      });
      setEchoesBearerMessage('Temporary ECCCH bearer saved for this session.');
      await loadEchoesHdtList();
    } catch (error: unknown) {
      setEchoesBearerMessage(error instanceof Error ? error.message : 'Failed to save the bearer.');
    } finally {
      setEchoesBearerBusy(false);
    }
  }

  async function clearEchoesBearerOverride(): Promise<void> {
    try {
      setEchoesBearerBusy(true);
      setEchoesBearerMessage(null);
      await clearEchoesDevBearer();
      setEchoesBearer('');
      setEchoesBearerMessage('Temporary ECCCH bearer removed from this session.');
      setEchoesHdtItems([]);
      setEchoesHdtListVisible(false);
      setEchoesHdtListError(null);
    } catch (error: unknown) {
      setEchoesBearerMessage(error instanceof Error ? error.message : 'Failed to clear the bearer.');
    } finally {
      setEchoesBearerBusy(false);
    }
  }

  // @spike feature/eccch-unregister-debug: remove after ECCCH unregister is no longer needed in production
  async function unregisterSelectedDigitalTwin(): Promise<void> {
    const trimmedDigitalTwinUri = echoesUnregisterUri.trim();
    if (!trimmedDigitalTwinUri) {
      setEchoesUnregisterFeedback({
        kind: 'error',
        text: 'Paste a Digital Twin URI before unregistering it.',
      });
      return;
    }

    if (!window.confirm(`Unregister Digital Twin "${trimmedDigitalTwinUri}" from ECCCH?`)) {
      return;
    }

    try {
      setEchoesUnregisterBusy(true);
      setEchoesUnregisterFeedback(null);
      const result = await unregisterEchoesDigitalTwin(trimmedDigitalTwinUri);
      setEchoesUnregisterFeedback({
        kind: 'success',
        text: result.disconnectedProjectIds.length > 0
          ? `${result.message} Local projects disconnected: ${result.disconnectedProjectIds.join(', ')}.`
          : result.message,
      });
    } catch (error: unknown) {
      setEchoesUnregisterFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Failed to unregister the Digital Twin.',
      });
    } finally {
      setEchoesUnregisterBusy(false);
    }
  }

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

      <div className="card shadow-sm" style={{ maxWidth: 720 }}>
        <div className="card-body">
          <h2 className="h5 mb-3 text-secondary">Temporary ECCCH Debug Operations</h2>
          <p className="text-muted small mb-3">
            Temporary development bridge.
          </p>
          <label htmlFor="profile-echoes-bearer" className="form-label">
            EGI / ECCCH Bearer
          </label>
          <textarea
            id="profile-echoes-bearer"
            className="form-control"
            rows={5}
            value={echoesBearer}
            onChange={(event) => setEchoesBearer(event.target.value)}
            disabled={echoesBearerBusy}
            placeholder="Paste the bearer token used in Swagger.  If OCRA already carries a valid ECCCH bearer from login, you can skip this step."
          />
          <div className="small text-muted mt-2">
            This override is saved for the current OCRA session and applies to import and HDT synchronization debug flows.
          </div>
          <div className="d-flex gap-2 mt-3">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => void saveEchoesBearerOverride()}
              disabled={echoesBearerBusy}
            >
              {echoesBearerBusy ? 'Saving...' : 'Save Bearer'}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => void clearEchoesBearerOverride()}
              disabled={echoesBearerBusy}
            >
              Clear
            </button>
          </div>
          {echoesBearerMessage && (
            <div
              className={`alert mt-3 mb-0 ${
                echoesBearerMessage.includes('Failed') || echoesBearerMessage.includes('Paste')
                  ? 'alert-warning'
                  : 'alert-success'
              }`}
            >
              {echoesBearerMessage}
            </div>
          )}
          {(info?.sys_admin || info?.sys_creator) ? (
            <EchoesHdtListWidget
              items={echoesHdtItems}
              loading={echoesHdtListLoading}
              error={echoesHdtListError}
              visible={echoesHdtListVisible}
              onRefresh={() => void loadEchoesHdtList()}
            />
          ) : null}

          {info?.sys_admin ? (
            <>
              <hr className="my-4" />
              <div>
                <h3 className="h6 text-secondary">Temporary ECCCH Debug Unregister</h3>
                <p className="text-muted small mb-3">
                  Development-only administrative helper. Unregisters a Digital Twin in ECCCH and disconnects any local OCRA project still linked to that same Digital Twin URI.
                </p>
                <label htmlFor="profile-echoes-unregister-uri" className="form-label">
                  Digital Twin URI
                </label>
                <input
                  id="profile-echoes-unregister-uri"
                  type="text"
                  className="form-control"
                  value={echoesUnregisterUri}
                  onChange={(event) => setEchoesUnregisterUri(event.target.value)}
                  disabled={echoesUnregisterBusy}
                  placeholder="http://echoes-eccch.eu/HDT/..."
                />
                <div className="d-flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => void unregisterSelectedDigitalTwin()}
                    disabled={echoesUnregisterBusy}
                  >
                    {echoesUnregisterBusy ? 'Unregistering...' : 'Unregister'}
                  </button>
                </div>
                {echoesUnregisterFeedback ? (
                  <div
                    className={`alert mt-3 mb-0 ${
                      echoesUnregisterFeedback.kind === 'error' ? 'alert-warning' : 'alert-success'
                    }`}
                  >
                    {echoesUnregisterFeedback.text}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
