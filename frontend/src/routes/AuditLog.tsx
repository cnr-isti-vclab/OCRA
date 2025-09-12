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
    const fetchAuditLog = async () => {
      try {
        // First check if user is admin
        const user = await getCurrentUser();
        const userIsAdmin = user?.sys_admin === true;
        setIsAdmin(userIsAdmin);
        
        let auditEvents;
        if (userIsAdmin) {
          // Admin sees all users' events
          auditEvents = await getFullAuditLog(50);
        } else {
          // Regular user sees only their events
          auditEvents = await getUserAuditLog(20);
        }
        
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
      <div>
        <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>Audit Log</h1>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#666' }}>Loading audit events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>Audit Log</h1>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <p style={{ color: 'crimson', margin: 0 }}>Error loading audit log: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', color: '#2c3e50' }}>
        🔍 {isAdmin ? 'System Audit Log (Admin)' : 'Security Audit Log'}
      </h1>
      <p style={{ color: '#666', marginBottom: '2rem', fontSize: '1.1rem' }}>
        {isAdmin 
          ? 'Track login and logout activity for all users in the system.'
          : 'Track your login and logout activity for security monitoring.'
        }
      </p>
      
      {events.length === 0 ? (
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, color: '#666' }}>No audit events found.</p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          {events.map((event, index) => (
            <div
              key={event.id}
              style={{
                padding: '1.5rem',
                borderBottom: index < events.length - 1 ? '1px solid #eee' : 'none',
                backgroundColor: index % 2 === 0 ? '#fafafa' : 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1, minWidth: '250px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: event.success 
                        ? (event.eventType === 'login' ? '#27ae60' : '#3498db')
                        : '#e74c3c',
                    }}
                  />
                  <strong style={{ 
                    textTransform: 'capitalize',
                    fontSize: '1.1rem',
                    color: '#2c3e50'
                  }}>
                    {event.eventType}
                  </strong>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    color: 'white',
                    backgroundColor: event.success 
                      ? (event.eventType === 'login' ? '#27ae60' : '#3498db')
                      : '#e74c3c',
                    fontWeight: 'bold',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px'
                  }}>
                    {event.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
                
                {isAdmin && event.user && (
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#2c3e50', 
                    marginBottom: '0.5rem',
                    fontFamily: 'monospace',
                    backgroundColor: '#e8f4f8',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #bee5eb'
                  }}>
                    <strong>User:</strong> {event.user.displayName} ({event.user.username || event.user.email})
                  </div>
                )}
                
                {event.errorMessage && (
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#e74c3c', 
                    marginBottom: '0.5rem',
                    fontFamily: 'monospace',
                    backgroundColor: '#fdf2f2',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #fadbd8'
                  }}>
                    <strong>Error:</strong> {event.errorMessage}
                  </div>
                )}
                
                {event.userAgent && (
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: '#666', 
                    fontFamily: 'monospace',
                    backgroundColor: '#f8f9fa',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    wordBreak: 'break-all'
                  }}>
                    <strong>User Agent:</strong> {event.userAgent}
                  </div>
                )}
              </div>
              
              <div style={{ 
                fontSize: '0.9rem', 
                color: '#666',
                textAlign: 'right',
                minWidth: '150px',
                fontFamily: 'monospace'
              }}>
                {new Date(event.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
