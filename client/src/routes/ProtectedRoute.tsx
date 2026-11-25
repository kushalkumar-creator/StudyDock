import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { BookLoader } from '../components/BookLoader';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <BookLoader label="LOADING STUDYDOCK…" size="md" />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export function RoleRoute({ allow }: { allow: UserRole }) {
  const { user, role, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  if (role && role !== allow) {
    return <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return <Outlet />;
}
