import { AlertCircle, CheckCircle2, Lock, Mail, User } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export function Login() {
  const { user, role, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user && role) {
      navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }
  }, [user, role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        const res = await signInWithEmail(email.trim(), password);
        if (res.error) setError(res.error);
      } else {
        if (fullName.trim().length < 2) {
          setError('Please enter your full name.');
          return;
        }
        const res = await signUpWithEmail(fullName.trim(), email.trim(), password);
        if (res.error) {
          setError(res.error);
        } else if (res.needsConfirmation) {
          setInfo('Check your inbox to confirm your email address, then sign in.');
          setMode('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  return (
    <AppShell showSidebar={false}>
      <div className="min-h-[74vh] flex items-center justify-center py-6">
        <div className="w-full max-w-md editorial-card p-7 sm:p-9 space-y-6 border-[var(--border-strong)]">
          <div className="space-y-2 border-b border-[var(--border-color)] pb-5">
            <div className="meta-label flex items-center gap-2">
              <span className="status-pulse" />
              {mode === 'signin' ? '// MEMBER ACCESS' : '// NEW READER REGISTRATION'}
            </div>
            <h1 className="font-poster text-4xl sm:text-5xl">
              {mode === 'signin' ? 'ENTER STUDYDOCK' : 'JOIN STUDYDOCK'}
            </h1>
            <p className="text-xs sm:text-sm opacity-80">
              {mode === 'signin'
                ? 'Sign in with Gmail or email to reserve desks and borrow volumes.'
                : 'Register once for live 3-floor seat access and signed QR gate passes.'}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="p-3.5 border border-amber-400/60 bg-amber-400/10 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
                <code>client/.env</code> to enable live authentication.
              </span>
            </div>
          )}

          {error && (
            <div className="p-3.5 border border-rose-400/70 bg-rose-500/15 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="p-3.5 border border-emerald-400/70 bg-emerald-500/15 text-xs sm:text-sm flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            className="btn-slide w-full py-3 px-4 text-xs"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.24-.92 2.29-1.97 3v2.49h3.18c1.86-1.71 2.94-4.23 2.94-7.21 0-.42-.04-.83-.11-1.2z"
              />
              <path
                fill="currentColor"
                d="M12.17 21c2.65 0 4.88-.88 6.51-2.38l-3.18-2.49c-.88.59-2.01.94-3.33.94-2.56 0-4.73-1.73-5.51-4.05H3.38v2.57C5 18.81 8.32 21 12.17 21z"
              />
              <path
                fill="currentColor"
                d="M6.66 13.02c-.2-.59-.31-1.22-.31-1.87s.11-1.28.31-1.87V6.71H3.38A9.83 9.83 0 002.33 11.15c0 1.59.38 3.09 1.05 4.44l3.28-2.57z"
              />
              <path
                fill="currentColor"
                d="M12.17 5.23c1.44 0 2.74.5 3.76 1.47l2.82-2.82C17.04 2.29 14.82 1.3 12.17 1.3 8.32 1.3 5 3.49 3.38 6.71l3.28 2.57c.78-2.32 2.95-4.05 5.51-4.05z"
              />
            </svg>
            CONTINUE WITH GMAIL
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="meta-label">OR EMAIL CREDENTIALS</span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="meta-label block mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Kushal Kumar"
                    className="editorial-input pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="meta-label block mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="editorial-input pl-10"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="meta-label">Password</label>
                {mode === 'signin' && (
                  <Link
                    to="/forgot-password"
                    className="text-[11px] font-bold tracking-[0.12em] uppercase underline underline-offset-4 opacity-80 hover:opacity-100"
                  >
                    FORGOT?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="editorial-input pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-slide btn-slide-solid w-full py-3.5 text-xs"
            >
              {submitting
                ? 'AUTHENTICATING…'
                : mode === 'signin'
                  ? 'SIGN IN TO STUDYDOCK →'
                  : 'CREATE READER ACCOUNT →'}
            </button>
          </form>

          <p className="text-center text-xs tracking-[0.06em] opacity-80 pt-2 border-t border-[var(--border-color)]">
            {mode === 'signin' ? (
              <>
                NEW TO THE ARCHIVE?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="font-bold uppercase underline underline-offset-4 ml-1"
                >
                  REGISTER
                </button>
              </>
            ) : (
              <>
                ALREADY REGISTERED?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="font-bold uppercase underline underline-offset-4 ml-1"
                >
                  SIGN IN
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
