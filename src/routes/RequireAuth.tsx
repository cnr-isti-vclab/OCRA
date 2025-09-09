import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { isLoggedIn } from '../oauth';

/**
 * ROUTE GUARD COMPONENT (Updated for Database Authentication)
 * 
 * RequireAuth is a "route guard" or "protected route" component that controls
 * access to certain parts of the application based on authentication status.
 * 
 * DATABASE INTEGRATION CHANGES:
 * - Now checks authentication status via database session instead of sessionStorage
 * - Validates session expiry server-side for better security
 * - Handles async authentication checking with loading state
 * 
 * How route guards work:
 * 1. They wrap other components/routes that need protection
 * 2. They check some condition (here: if user has valid session in database)
 * 3. If condition passes: render the protected content (children)
 * 4. If condition fails: redirect to a different route (usually login/home)
 * 
 * This pattern is common in SPAs to protect sensitive pages like user profiles,
 * admin dashboards, or any content requiring authentication.
 */

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  // useLocation hook gives us access to current route information
  // We'll use this to remember where user was trying to go
  const location = useLocation();
  
  // State for async authentication checking
  const [isChecking, setIsChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  
  useEffect(() => {
    // Check authentication status asynchronously
    const checkAuth = async () => {
      try {
        const loggedIn = await isLoggedIn();
        setAuthenticated(loggedIn);
      } catch (error) {
        console.error('Authentication check failed:', error);
        setAuthenticated(false);
      } finally {
        setIsChecking(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Show loading while checking authentication
  if (isChecking) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Checking authentication...</p>
      </div>
    );
  }
  
  if (!authenticated) {
    // User is not authenticated
    // Navigate component triggers a programmatic redirect
    // - "replace" replaces current history entry (user can't go back to protected route)
    // - "state" passes data to destination route (here: where user was trying to go)
    // The destination component can access this via useLocation().state
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  
  // User is authenticated: render the protected content
  // children represents whatever component was wrapped by RequireAuth
  return <>{children}</>;
}
