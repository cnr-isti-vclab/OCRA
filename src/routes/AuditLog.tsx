import { useEffect, useState } from 'react';
import { getUserAuditLog } from '../oauth-backend';

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
 */

interface AuditEvent {
  id: string;
  eventType: 'login' | 'logout';
  success: boolean;
  userAgent?: string;
  createdAt: string;
  errorMessage?: string;
}

export default function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuditLog = async () => {
      try {
        const auditEvents = await getUserAuditLog(20); // Get last 20 events
        setEvents(auditEvents);
      } catch (e: any) {
        console.error('Failed to fetch audit log:', e);
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLog();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Audit Log</h2>
        <p>Loading audit events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Audit Log</h2>
        <p style={{ color: 'crimson' }}>Error loading audit log: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>🔍 Security Audit Log</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Track your login and logout activity for security monitoring.
      </p>
      
      {events.length === 0 ? (
        <p>No audit events found.</p>
      ) : (
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: 8, 
          overflow: 'hidden' 
        }}>
          {events.map((event, index) => (
            <div
              key={event.id}
              style={{
                padding: 12,
                borderBottom: index < events.length - 1 ? '1px solid #eee' : 'none',
                backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: event.success 
                        ? (event.eventType === 'login' ? '#4CAF50' : '#2196F3')
                        : '#F44336',
                    }}
                  />
                  <strong style={{ textTransform: 'capitalize' }}>
                    {event.eventType}
                  </strong>
                  <span style={{ 
                    fontSize: 12, 
                    color: event.success ? '#4CAF50' : '#F44336',
                    fontWeight: 'bold'
                  }}>
                    {event.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
                
                {event.errorMessage && (
                  <div style={{ 
                    fontSize: 12, 
                    color: '#F44336', 
                    marginTop: 4,
                    fontFamily: 'monospace'
                  }}>
                    Error: {event.errorMessage}
                  </div>
                )}
                
                {event.userAgent && (
                  <div style={{ 
                    fontSize: 11, 
                    color: '#666', 
                    marginTop: 4,
                    fontFamily: 'monospace',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {event.userAgent}
                  </div>
                )}
              </div>
              
              <div style={{ 
                fontSize: 12, 
                color: '#666',
                textAlign: 'right',
                minWidth: 120
              }}>
                {new Date(event.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        backgroundColor: '#e3f2fd', 
        border: '1px solid #1976d2', 
        borderRadius: 4,
        fontSize: 12 
      }}>
        <strong>🛡️ Security Note:</strong> This audit log helps you monitor account activity. 
        If you see any suspicious login attempts, please secure your account immediately.
      </div>
      
      <p style={{ marginTop: 16 }}>
        <a href="/profile">← Back to Profile</a>
      </p>
    </div>
  );
}
