import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookLoader } from '../components/BookLoader';
import { useAuth } from '../hooks/useAuth';

export function AuthCallback() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login', { replace: true });
    } else if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <BookLoader label="VERIFYING CREDENTIALS…" size="md" />
    </div>
  );
}
