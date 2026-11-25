import {
  AlertCircle,
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  Download,
  QrCode,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { EntryPassModal } from '../components/EntryPassModal';
import { apiFetch, apiFetchCached, getApiCache } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import type { BookingRecord, EntryPass } from '../types';

interface GroupInviteRow {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
  group?: {
    id: string;
    name: string;
    owner?: { full_name: string; email: string };
    room?: { label: string; section: string };
  };
}

interface ReservationsResponse {
  upcoming: BookingRecord[];
  current: BookingRecord[];
  previous: BookingRecord[];
  groupInvites: GroupInviteRow[];
}

export function Reservations() {
  const initialCache = getApiCache<ReservationsResponse>('/api/bookings/mine');
  const [tab, setTab] = useState<'upcoming' | 'current' | 'previous'>('upcoming');
  const [upcoming, setUpcoming] = useState<BookingRecord[]>(initialCache?.upcoming ?? []);
  const [current, setCurrent] = useState<BookingRecord[]>(initialCache?.current ?? []);
  const [previous, setPrevious] = useState<BookingRecord[]>(initialCache?.previous ?? []);
  const [groupInvites, setGroupInvites] = useState<GroupInviteRow[]>(
    initialCache?.groupInvites ?? [],
  );
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [activePass, setActivePass] = useState<{
    booking: BookingRecord;
    entryPass: EntryPass;
  } | null>(null);

  const loadReservations = useCallback(async (force = false) => {
    try {
      if (!getApiCache('/api/bookings/mine')) setLoading(true);
      const res = await apiFetchCached<ReservationsResponse>('/api/bookings/mine', {
        maxAgeMs: 20_000,
        force,
      });
      setUpcoming(res.upcoming);
      setCurrent(res.current);
      setPrevious(res.previous);
      setGroupInvites(res.groupInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reservations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReservations(false);
  }, [loadReservations]);

  useRealtime(['bookings', 'seats'], () => {
    void loadReservations(true);
  });

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this desk reservation? Its gate pass stops working immediately.')) {
      return;
    }
    try {
      await apiFetch(`/api/bookings/${id}`, { method: 'DELETE' });
      await loadReservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel.');
    }
  };

  const handleExtend = async (booking: BookingRecord, extraMinutes: number) => {
    try {
      setError(null);
      const nextEnd = new Date(Date.parse(booking.end_at) + extraMinutes * 60_000).toISOString();
      const res = await apiFetch<{ booking: BookingRecord; entryPass?: EntryPass | null }>(
        `/api/bookings/${booking.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ endAt: nextEnd }),
        },
      );
      if (res.entryPass) setActivePass({ booking: res.booking, entryPass: res.entryPass });
      await loadReservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to extend booking.');
    }
  };

  const handleRespondInvite = async (inviteId: string, status: 'accepted' | 'declined') => {
    try {
      await apiFetch(`/api/bookings/invites/${inviteId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadReservations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update invite.');
    }
  };

  const activeList = tab === 'upcoming' ? upcoming : tab === 'current' ? current : previous;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label">// 03. ENTRY PASSES &amp; ARCHIVE LOG</div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1">MY RESERVATIONS</h1>
          </div>
          <Link to="/book" className="self-start btn-slide btn-slide-solid px-4 py-2.5 text-xs">
            + RESERVE ANOTHER DESK
          </Link>
        </div>

        {error && (
          <div className="p-3.5 border border-rose-400/70 bg-rose-500/15 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {groupInvites.filter((i) => i.status === 'pending').length > 0 && (
          <div className="editorial-card p-5 border-[var(--border-strong)] space-y-3">
            <h2 className="meta-label flex items-center gap-2">
              <Users className="h-4 w-4" /> PENDING STUDY SUITE INVITATIONS
            </h2>
            {groupInvites
              .filter((i) => i.status === 'pending')
              .map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-[var(--border-color)] bg-[var(--bg-primary)]"
                >
                  <div className="text-sm">
                    <span className="font-bold uppercase">{inv.group?.name}</span> · SUITE{' '}
                    <span className="font-mono font-bold">{inv.group?.room?.label}</span>
                    <div className="text-xs opacity-75">
                      Invited by {inv.group?.owner?.full_name || inv.group?.owner?.email}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRespondInvite(inv.id, 'accepted')}
                      className="btn-slide btn-slide-solid px-3 py-1.5 text-[11px]"
                    >
                      <Check className="h-3.5 w-3.5" /> ACCEPT
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRespondInvite(inv.id, 'declined')}
                      className="btn-slide px-3 py-1.5 text-[11px]"
                    >
                      <X className="h-3.5 w-3.5" /> DECLINE
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Sharp Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-4">
          {(
            [
              ['upcoming', `UPCOMING [${upcoming.length}]`],
              ['current', `CURRENT [${current.length}]`],
              ['previous', `PREVIOUS [${previous.length}]`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-xs font-bold tracking-[0.14em] uppercase border transition-colors ${
                tab === key
                  ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                  : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="editorial-card p-12 text-center meta-label">LOADING RESERVATIONS…</div>
        ) : activeList.length === 0 ? (
          <div className="editorial-card p-12 text-center space-y-4">
            <CalendarClock className="h-10 w-10 mx-auto opacity-45" />
            <p className="meta-label">NO {tab.toUpperCase()} RESERVATIONS ON RECORD</p>
            <Link to="/book" className="btn-slide btn-slide-solid px-4 py-2.5 text-xs">
              FIND AN OPEN DESK →
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {activeList.map((b) => (
              <div
                key={b.id}
                className="editorial-card p-5 flex flex-col justify-between gap-4 border-[var(--border-strong)]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-poster text-3xl tracking-wide">{b.seat?.label}</span>
                      <p className="meta-label mt-0.5">
                        {b.seat?.floor?.name} · {b.seat?.section}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 border border-[var(--border-strong)] text-[10px] font-bold uppercase tracking-[0.16em]">
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-xs font-mono flex items-center gap-2 opacity-90">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {new Date(b.start_at).toLocaleDateString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      //{' '}
                      {new Date(b.start_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      –{' '}
                      {new Date(b.end_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {b.group && (
                    <div className="text-xs border border-[var(--border-color)] bg-[var(--bg-primary)] p-2.5">
                      <span className="font-bold uppercase">GROUP: {b.group.name}</span>
                      {b.group.invites && b.group.invites.length > 0 && (
                        <div className="opacity-75 mt-0.5">
                          Invited: {b.group.invites.map((i) => `${i.email} (${i.status})`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-color)]">
                  {b.entryPass && (
                    <button
                      type="button"
                      onClick={() => setActivePass({ booking: b, entryPass: b.entryPass! })}
                      className="btn-slide btn-slide-solid px-3 py-1.5 text-[11px]"
                    >
                      <QrCode className="h-3.5 w-3.5" /> ENTRY PASS
                    </button>
                  )}

                  {b.entryPass?.googleCalendarUrl && (
                    <a
                      href={b.entryPass.googleCalendarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-slide px-2.5 py-1.5 text-[11px]"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> GCAL
                    </a>
                  )}

                  {b.entryPass?.qrDataUrl && (
                    <a
                      href={b.entryPass.qrDataUrl}
                      download={`studydock-qr-${b.seat?.label || 'pass'}.png`}
                      className="btn-slide px-2.5 py-1.5 text-[11px]"
                    >
                      <Download className="h-3.5 w-3.5" /> QR PNG
                    </a>
                  )}

                  {(b.status === 'booked' || b.status === 'checked_in') && (
                    <button
                      type="button"
                      onClick={() => void handleExtend(b, 30)}
                      className="btn-slide px-2.5 py-1.5 text-[11px]"
                    >
                      +30 MIN
                    </button>
                  )}

                  {b.status === 'booked' && (
                    <button
                      type="button"
                      onClick={() => void handleCancel(b.id)}
                      className="ml-auto px-2.5 py-1.5 border border-rose-400/70 text-rose-300 hover:bg-rose-600 hover:text-white text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> CANCEL
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activePass && (
        <EntryPassModal
          booking={activePass.booking}
          entryPass={activePass.entryPass}
          onClose={() => setActivePass(null)}
        />
      )}
    </AppShell>
  );
}
