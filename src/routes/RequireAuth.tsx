import { Navigate, useLocation } from 'react-router-dom';

/**
 * ROUTE GUARD COMPONENT
 * 
 * RequireAuth is a "route guard" or "protected route" component that controls
 * access to certain parts of the application based on authentication status.
 * 
 * How route guards work:
 * 1. They wrap other components/routes that need protection
 * 2. They check some condition (here: if user has valid tokens)
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
  
  // Check if user has authentication tokens in sessionStorage
  // In a real app, you might also validate token expiry here
  const tokens = sessionStorage.getItem('oauth_tokens');
  
  if (!tokens) {
    // User is not authenticated
    // Navigate component triggers a programmatic redirect
    // - "replace" replaces current history entry (user can't go back to protected route)
    // - "state" passes data to destination route (here: where user was trying to go)
    // The destination component can access this via useLocation().state
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  
  // User is authenticated: render the protected content
  // children represents whatever component was wrapped by RequireAuth
  return children;
}
