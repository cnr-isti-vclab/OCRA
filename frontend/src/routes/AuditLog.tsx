import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { getUserAuditLog, getFullAuditLog, getCurrentUser } from '../backend';

/**
 * AUDIT LOG COMPONENT (Updated for Backend API)
 * 
 * This component displays the user's login and logout history for security
 * and audit purposes. It demonstrates how authentication events can be tracked
 * and presented to users for transparency and security awareness.
 * 
 * BACKEND API INTEGRATION:
 * - Fetches audit data from backend API endpoint
 * - Server-side filtering and pagination
 * - Better performance and security
 * 
 * Features:
 * - Shows chronological list of login/logout events
 * - Displays success/failure status
 * - Shows timestamps and user agent information
 * - Helps users identify suspicious activity
 * - For admins: Shows all users' audit events
 */

interface AuditEvent {
  id: string;
  eventType: 'login' | 'logout';
  success: boolean;
  userAgent?: string;
  createdAt: string;
  errorMessage?: string;
  userSub?: string; // Added for admin view
  user?: {
    sub: string;
    name: string;
    email: string;
    username: string;
    displayName: string;
  } | null;
}

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Try to restore cached events first so navigating away/back doesn't clear console output
    const cached = sessionStorage.getItem('ocra_audit_events');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as AuditEvent[];
        setEvents(parsed);
        setLoading(false);
      } catch (err) {
        console.warn('Failed to parse cached audit events, will refetch', err);
        sessionStorage.removeItem('ocra_audit_events');
      }
    }

    const fetchAuditLog = async () => {
      try {
        const user = await getCurrentUser();
        const userIsAdmin = user?.sys_admin === true;
        setIsAdmin(userIsAdmin);
        console.log('🧭 AuditLog: userIsAdmin=', userIsAdmin, 'user=', user?.sub);
        let auditEvents: AuditEvent[] = [];
        if (userIsAdmin) {
          console.log('🧭 AuditLog: fetching full audit (admin)');
          auditEvents = await getFullAuditLog(50);
        } else {
          console.log('🧭 AuditLog: fetching user audit for', user?.sub);
          auditEvents = await getUserAuditLog(20);
        }
        setEvents(auditEvents);
        try {
          sessionStorage.setItem('ocra_audit_events', JSON.stringify(auditEvents));
        } catch (err) {
          console.warn('Failed to persist audit events to sessionStorage', err);
        }
      } catch (e: any) {
        console.error('Failed to fetch audit log:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    // Always refresh in background to get up-to-date events, but keep cached data
    // displayed until new data arrives to avoid clearing logs when navigating back.
    fetchAuditLog();
  }, []);

  if (loading) {
    return (
      <div className="container py-5">
        <h1 className="mb-4 text-dark">Audit Log</h1>
        <div className="card p-4 text-center text-muted">Loading audit events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-5">
        <h1 className="mb-4 text-dark">Audit Log</h1>
        <div className="alert alert-danger">Error loading audit log: {error}</div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <h1 className="mb-4 text-dark">
        🔍 {isAdmin ? 'System Audit Log (Admin)' : 'Security Audit Log'}
      </h1>
      <p className="text-secondary mb-4">
        {isAdmin 
          ? 'Track login and logout activity for all users in the system.'
          : 'Track your login and logout activity for security monitoring.'
        }
      </p>
      {events.length === 0 ? (
        <div className="card p-4 text-center text-muted">No audit events found.</div>
      ) : (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  {isAdmin && <th>User</th>}
                  <th>User Agent</th>
                  <th>Time</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="text-capitalize fw-bold">
                      {event.eventType}
                    </td>
                    <td>
                      <span className={`badge ${event.success ? (event.eventType === 'login' ? 'bg-success' : 'bg-primary') : 'bg-danger'}`}>
                        {event.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        {event.user ? (
                          <span className="text-monospace">
                            {event.user.displayName} ({event.user.username || event.user.email})
                          </span>
                        ) : <span className="text-muted">-</span>}
                      </td>
                    )}
                    <td className="text-monospace small">
                      {event.userAgent || <span className="text-muted">-</span>}
                    </td>
                    <td className="text-monospace small">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td>
                      {event.errorMessage ? (
                        <span className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle">
                          {event.errorMessage}
                        </span>
                      ) : <span className="text-muted">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
