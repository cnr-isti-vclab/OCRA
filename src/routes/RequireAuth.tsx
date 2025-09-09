import { Navigate, useLocation } from 'react-router-dom';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const tokens = sessionStorage.getItem('oauth_tokens');
  if (!tokens) {
    // Not logged in: go back to home, preserve where we were trying to go
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return children;
}
