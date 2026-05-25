import 'bootstrap/dist/css/bootstrap.min.css';
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logout, getCurrentUser } from '../backend';
import { getApiBase } from '../config/oauth';
import { useProjectStructuringLock } from '../context/ProjectStructuringLockContext';

/**
 * SIDEBAR LAYOUT COMPONENT
 * 
 * This component provides a consistent layout with a sidebar navigation
 * for authenticated users. It includes:
 * - A collapsible sidebar with navigation items
 * - Header bar with user information and logout button
 * - Main content area for route components
 * - Responsive design that works on mobile and desktop
 */

interface SidebarLayoutProps {
  children: React.ReactNode;
}

interface User {
  sys_admin?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  username?: string;
  email?: string;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const location = useLocation();

  // Fetch current user information to check admin status
  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Failed to get current user for sidebar:', error);
        setCurrentUser(null);
      }
    })();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      // The logout function should handle navigation
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Parse project context from the current URL
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)(\/[^?#]*)?$/);
  const currentProjectId = projectMatch?.[1] ?? null;
  const projectSubPath = projectMatch?.[2] ?? '';
  const viewerMode = new URLSearchParams(location.search).get('mode') ?? '3d';

  const [projectName, setProjectName] = useState<string | null>(null);
  const [has3d, setHas3d] = useState<boolean | null>(null);
  const [has2d, setHas2d] = useState<boolean | null>(null);
  const { getProjectLockState, toggleProjectLock } = useProjectStructuringLock();
  const lockState = getProjectLockState(currentProjectId ?? undefined);
  useEffect(() => {
    if (!currentProjectId) { setProjectName(null); setHas3d(null); setHas2d(null); return; }
    fetch(`${getApiBase()}/api/projects/${currentProjectId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setProjectName(data?.project?.name ?? data?.name ?? null))
      .catch(() => setProjectName(null));
    fetch(`${getApiBase()}/api/projects/${currentProjectId}/hdt`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(doc => {
        const assets: any[] = Array.isArray(doc?.digitalAssets) ? doc.digitalAssets : [];
        setHas3d(assets.some((a: any) => typeof a?.type === 'string' && (a.type === '3d-model' || a.type.includes('3d'))));
        setHas2d(assets.some((a: any) => a?.type === 'rti'));
      })
      .catch(() => { setHas3d(null); setHas2d(null); });
  }, [currentProjectId]);

  // Get display name for user
  const getDisplayName = (user: User) => {
    if (user.given_name || user.family_name) {
      return `${user.given_name || ''} ${user.family_name || ''}`.trim();
    }
    return user.name || user.email || 'Unknown User';
  };

  return (
    <div className="d-flex flex-column bg-light" style={{height: '100vh', overflow: 'hidden'}}>
      {/* Header Bar - Fixed at top */}
      <nav className="navbar navbar-expand navbar-light bg-white border-bottom shadow-sm px-3 flex-shrink-0" style={{zIndex: 1000}}>
        <div className="d-flex align-items-center gap-3">
          <img src="/echoes-logo.png" alt="Echoes" style={{ height: '40px' }} />
          {currentProjectId ? (
            <>
              <span className="text-secondary" style={{ fontSize: '1.1rem' }}>|</span>
              <Link
                to={`/projects/${currentProjectId}`}
                className="fw-bold text-dark text-decoration-none"
                style={{ fontSize: '1rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={projectName ?? ''}
              >
                {projectName ?? '\u2026'}
              </Link>
              <div className="d-flex gap-1">
                <ProjectNavTab to={`/projects/${currentProjectId}`}           label="3D"       active={projectSubPath === '' && viewerMode !== '2d'} disabled={has3d === false} />
                <ProjectNavTab to={`/projects/${currentProjectId}?mode=2d`}  label="2D"       active={projectSubPath === '' && viewerMode === '2d'}  disabled={has2d === false} />
                <ProjectNavTab to={`/projects/${currentProjectId}/hdt`}      label="HDT"      active={projectSubPath === '/hdt'} />
                <ProjectNavTab to={`/projects/${currentProjectId}/edit`}     label="Settings" active={projectSubPath === '/edit'} />
                <EditLockButton
                  lockStatus={lockState.status}
                  onToggle={() => toggleProjectLock(currentProjectId!, lockState.status === 'inactive')}
                />
              </div>
            </>
          ) : (
            <span className="navbar-brand fw-bold fs-4 mb-0">OCRA</span>
          )}
        </div>
        <div className="ms-auto d-flex align-items-center gap-3">
          {currentUser && (
            <>
              <div className="text-end">
                <div className="fw-semibold text-dark small">{getDisplayName(currentUser)}</div>
                {currentUser.username && (
                  <div className="badge bg-light text-secondary border border-1 border-secondary-subtle mt-1">
                    {currentUser.username}
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-link p-0 text-secondary"
                title="Logout"
                style={{ fontSize: '1.2em' }}
              >
                <i className="bi bi-box-arrow-right"></i>
              </button>
            </>
          )}
        </div>
      </nav>
      {/* Main Layout Container - Takes remaining height */}
      <div className="d-flex flex-grow-1" style={{minHeight: 0, overflow: 'hidden'}}>
        {/* Sidebar - Fixed, scrollable if content overflows */}
        <aside className={`bg-dark text-white flex-shrink-0 d-flex flex-column ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`} style={{width: sidebarOpen ? 180 : 48, transition: 'width 0.2s', overflowY: 'auto'}}>
          <div className={`d-flex align-items-center ${sidebarOpen ? 'justify-content-end' : 'justify-content-center'} px-2 py-2 border-bottom border-secondary flex-shrink-0`}>
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
              style={{padding: '0.25rem 0.5rem', fontSize: '0.9rem'}}
            >
              {sidebarOpen ? '←' : '→'}
            </button>
          </div>
          <nav className="nav flex-column py-1">
            <SidebarItem
              to="/profile"
              icon="👤"
              label="Profile"
              isActive={isActive('/profile')}
              sidebarOpen={sidebarOpen}
            />
            <SidebarItem
              to="/projects"
              icon="📁"
              label="HDT Projects"
              isActive={isActive('/projects')}
              sidebarOpen={sidebarOpen}
            />
            <SidebarItem
              to="/vocabularies"
              icon="📚"
              label="Vocabularies"
              isActive={isActive('/vocabularies')}
              sidebarOpen={sidebarOpen}
            />
            <SidebarItem
              to="/audit"
              icon="📊"
              label="Audit Log"
              isActive={isActive('/audit')}
              sidebarOpen={sidebarOpen}
            />
            {/* Show User Admin only for system administrators */}
            {currentUser?.sys_admin && (
              <SidebarItem
                to="/user-admin"
                icon="👥"
                label="User Admin"
                isActive={isActive('/user-admin')}
                sidebarOpen={sidebarOpen}
              />
            )}
          </nav>
        </aside>
        {/* Main Content - Scrollable area */}
        <main className="flex-grow-1" style={{minWidth: 0, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column'}}>
          <div className="h-100">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

interface SidebarItemProps {
  to: string;
  icon: string;
  label: string;
  isActive: boolean;
  sidebarOpen: boolean;
}

interface ProjectNavTabProps { to: string; label: string; active: boolean; disabled?: boolean; }
function ProjectNavTab({ to, label, active, disabled }: ProjectNavTabProps) {
  if (disabled) {
    return (
      <span
        className="btn btn-sm btn-outline-secondary disabled"
        style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', opacity: 0.4, pointerEvents: 'none', cursor: 'default' }}
        aria-disabled="true"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      to={to}
      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
      style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
    >
      {label}
    </Link>
  );
}

interface EditLockButtonProps {
  lockStatus: 'inactive' | 'acquiring' | 'draining' | 'exclusive' | 'releasing';
  onToggle: () => void;
}

function EditLockButton({ lockStatus, onToggle }: EditLockButtonProps) {
  const busy = lockStatus === 'acquiring' || lockStatus === 'draining' || lockStatus === 'releasing';
  const active = lockStatus === 'exclusive';

  let title = 'Enable editing (acquire project lock)';
  if (active) title = 'Stop editing (release project lock)';
  else if (lockStatus === 'acquiring') title = 'Acquiring lock…';
  else if (lockStatus === 'draining') title = 'Waiting for other sessions to finish…';
  else if (lockStatus === 'releasing') title = 'Releasing lock…';

  return (
    <button
      className={`btn btn-sm ${active ? 'btn-warning' : 'btn-outline-secondary'}`}
      style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
      onClick={onToggle}
      disabled={busy}
      title={title}
    >
      {busy ? (
        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      ) : (
        <i className={`bi ${active ? 'bi-pencil-fill' : 'bi-pencil'}`}></i>
      )}
    </button>
  );
}

function SidebarItem({ to, icon, label, isActive, sidebarOpen }: SidebarItemProps) {
  return (
    <Link
      to={to}
      className={`nav-link d-flex align-items-center gap-2 px-2 py-1 rounded ${isActive ? 'bg-primary text-white fw-semibold' : 'text-white'}`}
      style={{margin: '0.12rem 0.12rem', fontSize: '0.9rem', transition: 'background-color 0.15s'}}
    >
      <span style={{ fontSize: '1.05rem' }}>{icon}</span>
      {sidebarOpen && <span>{label}</span>}
    </Link>
  );
}
