import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  QrCode,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AppShell } from '../../components/AppShell';
import { QRScanner } from '../../components/QRScanner';
import { apiFetch } from '../../lib/api';
import type { BookingRecord } from '../../types';

type GateStatus = 'VALID' | 'TOO EARLY' | 'EXPIRED' | 'INVALID';

interface GateResponse {
  result: GateStatus;
  message: string;
  booking?: BookingRecord;
}

const BANNER_CONFIG: Record<
  GateStatus,
  { bg: string; icon: typeof CheckCircle2; subtitle: string }
> = {
  VALID: {
    bg: 'bg-emerald-700 text-[#F0EDE5] border-emerald-300',
    icon: CheckCircle2,
    subtitle: 'ENTRY GRANTED // CHECK-IN RECORDED',
  },
  'TOO EARLY': {
    bg: 'bg-amber-400 text-[#00312F] border-amber-200',
    icon: Clock,
    subtitle: 'HOLD AT GATE // OUTSIDE ENTRY WINDOW',
  },
  EXPIRED: {
    bg: 'bg-orange-700 text-[#F0EDE5] border-orange-300',
    icon: AlertTriangle,
    subtitle: 'RESERVATION WINDOW ENDED',
  },
  INVALID: {
    bg: 'bg-rose-700 text-[#F0EDE5] border-rose-300',
    icon: XCircle,
    subtitle: 'ACCESS DENIED // FORGED, CANCELLED, OR USED',
  },
};

export function GateCheck() {
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<GateResponse | null>(null);
  const [history, setHistory] = useState<Array<GateResponse & { at: string }>>([]);

  const verifyPayload = async (payload: { token?: string; code?: string }) => {
    setVerifying(true);
    try {
      const res = await apiFetch<GateResponse>('/api/gate/verify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setLastResult(res);
      setHistory((prev) => [{ ...res, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 8));
    } catch (err) {
      setLastResult({
        result: 'INVALID',
        message: err instanceof Error ? err.message : 'Verification error.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = manualCode.replace(/\D/g, '');
    if (cleaned.length !== 6) return;
    await verifyPayload({ code: cleaned });
    setManualCode('');
  };

  const banner = lastResult ? BANNER_CONFIG[lastResult.result] : null;
  const BannerIcon = banner?.icon;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="pb-5 border-b border-[var(--border-color)]">
          <div className="meta-label">// 02. SINGLE-USE HMAC VERIFICATION</div>
          <h1 className="font-poster text-4xl sm:text-5xl mt-1 flex items-center gap-3">
            <QrCode className="h-8 w-8" /> GATE CHECK TERMINAL
          </h1>
        </div>

        {lastResult && banner && BannerIcon && (
          <div className={`border-2 p-6 sm:p-8 ${banner.bg}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <BannerIcon className="h-14 w-14 shrink-0" />
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] font-bold opacity-85">
                    {banner.subtitle}
                  </div>
                  <div className="font-poster text-5xl sm:text-6xl mt-1">{lastResult.result}</div>
                  <p className="text-sm opacity-95 mt-1">{lastResult.message}</p>
                </div>
              </div>

              {lastResult.booking && (
                <div className="border border-current/30 bg-black/15 p-4 text-xs min-w-[240px] uppercase tracking-wider">
                  <div className="font-bold text-sm">
                    {lastResult.booking.student?.full_name || 'READER'}
                  </div>
                  <div className="opacity-80 lowercase">{lastResult.booking.student?.email}</div>
                  <div className="mt-2.5 pt-2.5 border-t border-current/25 flex justify-between font-mono font-bold">
                    <span>DESK {lastResult.booking.seat?.label}</span>
                    <span>FLOOR 0{lastResult.booking.seat?.floor?.level}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 editorial-card p-6 space-y-4">
            <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
              OPTICAL QR SCANNER
            </h2>
            <QRScanner
              disabled={verifying}
              onScan={(decoded) => {
                if (/^\d{6}$/.test(decoded.trim())) void verifyPayload({ code: decoded.trim() });
                else void verifyPayload({ token: decoded.trim() });
              }}
            />
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div className="editorial-card p-6 space-y-4 border-[var(--border-strong)]">
              <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
                <KeyRound className="h-5 w-5" /> 6-DIGIT MANUAL CODE
              </h2>
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  aria-label="6-digit entry code"
                  className="editorial-input text-center font-mono text-3xl font-bold tracking-[0.35em] py-3.5"
                />
                <button
                  type="submit"
                  disabled={manualCode.length !== 6 || verifying}
                  className="btn-slide btn-slide-solid w-full py-3.5 text-xs"
                >
                  {verifying ? 'VERIFYING…' : 'VERIFY 6-DIGIT CODE →'}
                </button>
              </form>
            </div>

            <div className="editorial-card p-5 space-y-3">
              <h3 className="meta-label flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> SESSION GATE LOG
              </h3>
              {history.length === 0 ? (
                <p className="text-xs opacity-70 uppercase tracking-wider">No scans recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div
                      key={`${h.at}-${i}`}
                      className="flex items-center justify-between text-xs p-2.5 border border-[var(--border-color)] bg-[var(--bg-primary)]"
                    >
                      <div>
                        <span className="font-bold tracking-wider">{h.result}</span>{' '}
                        <span className="opacity-70 font-mono">
                          {h.booking?.seat?.label ? `// ${h.booking.seat.label}` : ''}
                        </span>
                      </div>
                      <span className="opacity-65 font-mono">{h.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
