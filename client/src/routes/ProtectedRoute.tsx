import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 border-2 border-[var(--border-color)] border-t-[var(--text-primary)] animate-spin" />
        <p className="text-xs font-bold tracking-[0.2em] uppercase opacity-75">
          LOADING STUDYDOCK…
        </p>
      </div>
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
