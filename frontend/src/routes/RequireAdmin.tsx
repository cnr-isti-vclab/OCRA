import 'bootstrap/dist/css/bootstrap.min.css';
import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getCurrentUser } from '../backend';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await getCurrentUser();
        setIsAdmin(!!user && !!user.sys_admin);
      } catch (e) {
        console.error('Admin check failed:', e);
        setIsAdmin(false);
      } finally {
        setIsChecking(false);
      }
    };
    checkAdmin();
  }, []);

  if (isChecking) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Checking admin privileges...</span>
        </div>
        <p className="text-muted">Checking admin privileges...</p>
      </div>
    );
  }

  if (!isAdmin) {
    // Not an admin: redirect to home/profile
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
