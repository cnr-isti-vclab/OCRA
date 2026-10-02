import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBase } from '../config/oauth';
import type { VocabularyProviderSummary } from 'shared/external-vocabulary';
import { getExternalVocabularyProviders } from '../services/ExternalVocabularyApi';
// @spike feature/vocabulary-color-spike — remove this import when vocabulary data is in DB
import TtlVocabularyWidget from './components/TtlVocabularyWidget';
import AatVocabularyExplorer from './components/AatVocabularyExplorer';

/**
 * VOCABULARIES COMPONENT
 * 
 * This component displays the list of vocabularies in the system.
 * It fetches vocabulary data from the backend API and presents it
 * in a user-friendly format.
 * 
 * Features:
 * - Shows all vocabularies with their details
 * - Loading states and error handling
 * - Responsive table layout
 */

interface Vocabulary {
  id: string;
  name: string;
  description: string;
  public: boolean;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  username?: string;
  displayName: string;
  sys_admin: boolean;
}

export default function VocabularyList() {
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [providers, setProviders] = useState<VocabularyProviderSummary[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionId = localStorage.getItem('oauth_session_id');
        
        // Fetch current user information (optional)
        if (sessionId) {
          try {
            const userResponse = await fetch(`${getApiBase()}/api/sessions/current`, {
              credentials: 'include',
              headers: {
                'Authorization': `Bearer ${sessionId}`,
                'Content-Type': 'application/json',
              },
            });

            if (userResponse.ok) {
              const userData = await userResponse.json();
              setUser(userData.user);
            }
          } catch (e) {
            console.log('User not authenticated');
          }
        }

        // Fetch vocabularies
        const response = await fetch(`${getApiBase()}/api/vocabularies`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch vocabularies: ${response.status}`);
        }

        const [data, externalProviders] = await Promise.all([
          response.json(),
          getExternalVocabularyProviders(),
        ]);
        setVocabularies(data.vocabularies || []);
        setProviders(externalProviders);
      } catch (e: any) {
        console.error('Failed to fetch data:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading vocabularies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container-fluid py-4">
        <div className="alert alert-danger">
          <h4>Error Loading Vocabularies</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4">
      {/* Header Section */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h2 mb-2">Vocabularies</h1>
          <p className="text-muted mb-0">
            Controlled vocabularies and terminologies
          </p>
        </div>
        <div>
          <Link to="/projects" className="btn btn-outline-secondary">
            <i className="bi bi-arrow-left me-2"></i>
            Back to HDT Projects
          </Link>
        </div>
      </div>

      {/* Vocabularies Table */}
      {vocabularies.length === 0 && providers.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-5">
            <i className="bi bi-book display-1 text-muted mb-3"></i>
            <h3>No Vocabularies Available</h3>
            <p className="text-muted">
              There are no vocabularies in the system yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Source</th>
                    <th>Visibility</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {vocabularies.map((vocabulary) => (
                    <tr key={vocabulary.id}>
                      <td>
                        <strong>{vocabulary.name}</strong>
                      </td>
                      <td>
                        <div style={{ maxWidth: '400px' }}>
                          {vocabulary.description}
                        </div>
                      </td>
                      <td>OCRA</td>
                      <td>
                        {vocabulary.public ? (
                          <span className="badge bg-success">
                            <i className="bi bi-globe me-1"></i>
                            Public
                          </span>
                        ) : (
                          <span className="badge bg-secondary">
                            <i className="bi bi-lock me-1"></i>
                            Private
                          </span>
                        )}
                      </td>
                      <td>
                        <small className="text-muted">
                          {new Date(vocabulary.createdAt).toLocaleDateString()}
                        </small>
                      </td>
                      <td>
                        <small className="text-muted">
                          {new Date(vocabulary.updatedAt).toLocaleDateString()}
                        </small>
                      </td>
                    </tr>
                  ))}
                  {providers.map((provider) => (
                    <tr key={`provider:${provider.id}`}>
                      <td>
                        <strong>{provider.name}</strong>
                      </td>
                      <td>
                        <div style={{ maxWidth: '400px' }}>{provider.description}</div>
                      </td>
                      <td>
                        <a href={provider.canonicalUriPrefix} target="_blank" rel="noreferrer">
                          Getty
                        </a>
                      </td>
                      <td>
                        <span className="badge bg-success">
                          <i className="bi bi-patch-check me-1"></i>
                          Authoritative
                        </span>
                      </td>
                      <td><small className="text-muted">—</small></td>
                      <td><small className="text-muted">—</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* @spike feature/vocabulary-color-spike — remove <TtlVocabularyWidget /> when vocabulary data is in DB */}
      <TtlVocabularyWidget />

      <AatVocabularyExplorer />

    </div>
  );
}
