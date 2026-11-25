import { CheckCircle2, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { supabase } from '../lib/supabaseClient';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) setError(err.message);
    else {
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    }
  };

  return (
    <AppShell showSidebar={false}>
      <div className="min-h-[68vh] flex items-center justify-center">
        <div className="w-full max-w-md editorial-card p-8 space-y-5 border-[var(--border-strong)]">
          <h1 className="font-poster text-4xl">NEW PASSWORD</h1>
          {done ? (
            <div className="p-4 border border-emerald-400/70 bg-emerald-500/15 flex items-center gap-2.5 text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Password updated. Redirecting to sign in…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 border border-rose-400/70 bg-rose-500/15 text-xs">{error}</div>
              )}
              <div className="relative">
                <Lock className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className="editorial-input pl-10"
                />
              </div>
              <div className="relative">
                <Lock className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  className="editorial-input pl-10"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-slide btn-slide-solid w-full py-3 text-xs"
              >
                {saving ? 'UPDATING…' : 'UPDATE PASSWORD →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
