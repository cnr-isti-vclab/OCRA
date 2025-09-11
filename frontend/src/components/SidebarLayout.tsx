import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logout, getCurrentUser } from '../backend';

/**
 * SIDEBAR LAYOUT COMPONENT
 * 
 * This component provides a consistent layout with a sidebar navigation
 * for authenticated users. It includes:
 * - A collapsible sidebar with navigation items
 * - Main content area for route components
 * - Responsive design that works on mobile and desktop
 */

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ sys_admin?: boolean } | null>(null);
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '250px' : '60px',
        backgroundColor: '#2c3e50',
        color: 'white',
        transition: 'width 0.3s ease',
        boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #34495e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {sidebarOpen && <h2 style={{ margin: 0, fontSize: '1.2rem' }}>OCRA Demo</h2>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0.5rem'
            }}
          >
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          <SidebarItem
            to="/profile"
            icon="👤"
            label="Profile"
            isActive={isActive('/profile')}
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
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'white',
              padding: '0.75rem 1rem',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              transition: 'background-color 0.2s',
              borderRadius: '4px',
              margin: '0 0.5rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e74c3c'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{ fontSize: '1.2rem' }}>🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        padding: '2rem',
        overflow: 'auto'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {children}
        </div>
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

function SidebarItem({ to, icon, label, isActive, sidebarOpen }: SidebarItemProps) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        color: 'white',
        textDecoration: 'none',
        margin: '0 0.5rem',
        borderRadius: '4px',
        backgroundColor: isActive ? '#3498db' : 'transparent',
        transition: 'background-color 0.2s',
        fontSize: '0.9rem'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = '#34495e';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      {sidebarOpen && <span>{label}</span>}
    </Link>
  );
}
