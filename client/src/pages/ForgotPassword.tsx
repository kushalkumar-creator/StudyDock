import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { supabase } from '../lib/supabaseClient';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <AppShell showSidebar={false}>
      <div className="min-h-[68vh] flex items-center justify-center">
        <div className="w-full max-w-md editorial-card p-8 space-y-5 border-[var(--border-strong)]">
          <Link to="/login" className="meta-label inline-flex items-center gap-1.5 hover:opacity-100">
            <ArrowLeft className="h-3.5 w-3.5" /> BACK TO SIGN IN
          </Link>
          <div className="space-y-1.5">
            <h1 className="font-poster text-4xl">RESET PASSWORD</h1>
            <p className="text-xs opacity-80">
              Enter your registered email address and we will dispatch a secure reset link.
            </p>
          </div>

          {sent ? (
            <div className="p-4 border border-emerald-400/70 bg-emerald-500/15 text-xs sm:text-sm flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Password reset email dispatched to {email}. Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 border border-rose-400/70 bg-rose-500/15 text-xs">{error}</div>
              )}
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
              <button
                type="submit"
                disabled={loading}
                className="btn-slide btn-slide-solid w-full py-3 text-xs"
              >
                {loading ? 'DISPATCHING…' : 'SEND RESET LINK →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
