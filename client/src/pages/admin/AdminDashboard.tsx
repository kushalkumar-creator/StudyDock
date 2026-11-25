import {
  BookOpen,
  CheckCircle2,
  Download,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { apiDownloadBlob, apiFetch, apiFetchCached, getApiCache, prefetchApi } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import type { BookingRecord } from '../../types';

interface AdminOverview {
  stats: {
    insideNow: number;
    totalUsableSeats: number;
    blockedSeats: number;
    todayBookings: number;
    todayNoShows: number;
    activeBookIssues: number;
  };
  floorOccupancy: Array<{
    floor_id: string;
    name: string;
    level: number;
    total: number;
    available: number;
    reserved: number;
    occupied: number;
    blocked: number;
    occupancyPct: number;
  }>;
  insideNow: BookingRecord[];
}

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(
    () => getApiCache<AdminOverview>('/api/admin/overview') ?? null,
  );
  const [reservations, setReservations] = useState<BookingRecord[]>(
    () => getApiCache<{ reservations: BookingRecord[] }>('/api/admin/reservations?tab=all')?.reservations ?? [],
  );
  const [tab, setTab] = useState<'all' | 'upcoming' | 'booked' | 'checked_in'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!getApiCache('/api/admin/overview'));
  const [exporting, setExporting] = useState(false);

  const loadAll = useCallback(
    async (force = false) => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({ tab });
        if (search.trim()) qs.set('search', search.trim());

        const [ov, res] = await Promise.all([
          apiFetchCached<AdminOverview>('/api/admin/overview', { maxAgeMs: 15_000, force }),
          apiFetchCached<{ reservations: BookingRecord[] }>(
            `/api/admin/reservations?${qs.toString()}`,
            { maxAgeMs: 15_000, force },
          ),
        ]);
        setOverview(ov);
        setReservations(res.reservations);
      } finally {
        setLoading(false);
      }
    },
    [tab, search],
  );

  useEffect(() => {
    void loadAll(false);
    // Prefetch other admin tabs in background so switching tabs is instant
    prefetchApi('/api/books');
    prefetchApi('/api/books/issues/all');
    prefetchApi('/api/admin/analytics');
    prefetchApi('/api/admin/settings');
    prefetchApi('/api/admin/announcements');
    prefetchApi('/api/seats');
    const timer = setInterval(() => void loadAll(true), 120_000);
    return () => clearInterval(timer);
  }, [loadAll]);

  useRealtime(['bookings', 'seats', 'books'], () => {
    void loadAll(true);
  });

  const handleAction = async (id: string, action: 'checkin' | 'checkout' | 'cancel') => {
    if (action === 'cancel') {
      await apiFetch(`/api/admin/reservations/${id}`, { method: 'DELETE' });
    } else {
      await apiFetch(`/api/admin/reservations/${id}/${action}`, { method: 'POST' });
    }
    await loadAll();
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await apiDownloadBlob(
        '/api/admin/export',
        `cyprus-reservations-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label flex items-center gap-2">
              <span className="status-pulse" />
              // 01. LIVE HALL CONTROL &amp; OCCUPANCY
            </div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1">ADMIN OPERATIONS</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll(true)}
              className="btn-slide px-3.5 py-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportExcel()}
              className="btn-slide px-3.5 py-2 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? 'EXPORTING…' : 'EXPORT .XLSX'}
            </button>
            <Link to="/admin/gate" className="btn-slide btn-slide-solid px-4 py-2 text-xs">
              <QrCode className="h-3.5 w-3.5" /> GATE SCANNER →
            </Link>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="editorial-card p-5">
            <div className="meta-label">INSIDE NOW</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-poster text-5xl">{overview?.stats.insideNow ?? 0}</span>
              <span className="font-mono text-xs opacity-70">
                / {overview?.stats.totalUsableSeats ?? 0}
              </span>
            </div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label">TODAY&apos;S BOOKINGS</div>
            <div className="font-poster text-5xl mt-2">{overview?.stats.todayBookings ?? 0}</div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label">NO-SHOWS RELEASED</div>
            <div className="font-poster text-5xl mt-2">{overview?.stats.todayNoShows ?? 0}</div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label flex items-center justify-between">
              ACTIVE BOOKS <BookOpen className="h-4 w-4" />
            </div>
            <div className="font-poster text-5xl mt-2">
              {overview?.stats.activeBookIssues ?? 0}
            </div>
          </div>
        </div>

        {/* Floor Occupancy + Inside Now */}
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 editorial-card p-5 space-y-4">
            <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
              FLOOR OCCUPANCY
            </h2>
            <div className="space-y-3.5">
              {(overview?.floorOccupancy ?? []).map((f) => (
                <div key={f.floor_id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                    <span>FLOOR 0{f.level}</span>
                    <span className="font-mono">
                      {f.occupied} IN · {f.reserved} RES · {f.available} FREE
                    </span>
                  </div>
                  <div className="h-3 border border-[var(--border-strong)] bg-[var(--bg-primary)]">
                    <div
                      className="h-full bg-[var(--text-primary)]"
                      style={{ width: `${Math.max(3, f.occupancyPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 editorial-card p-5 space-y-3">
            <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <Users className="h-5 w-5" /> WHO IS INSIDE NOW [{overview?.insideNow.length ?? 0}]
            </h2>
            {(overview?.insideNow ?? []).length === 0 ? (
              <p className="meta-label py-8 text-center">NO READERS CURRENTLY CHECKED IN</p>
            ) : (
              <div className="divide-y divide-[var(--border-color)] max-h-56 overflow-y-auto">
                {overview!.insideNow.map((b) => (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold uppercase truncate">{b.student?.full_name}</div>
                      <div className="opacity-75 font-mono">
                        DESK {b.seat?.label} // {b.minutesLeft ?? 0} MIN LEFT
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAction(b.id, 'checkout')}
                      className="btn-slide btn-slide-solid px-3 py-1.5 text-[11px]"
                    >
                      <LogOut className="h-3.5 w-3.5" /> CHECK OUT
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reservations Table */}
        <div className="editorial-card overflow-hidden border-[var(--border-strong)]">
          <div className="p-4 border-b border-[var(--border-color)] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', 'ALL'],
                  ['upcoming', 'UPCOMING'],
                  ['booked', 'BOOKED'],
                  ['checked_in', 'CHECKED IN'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3.5 py-1.5 text-[11px] font-bold tracking-[0.14em] uppercase border transition-colors ${
                    tab === key
                      ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                      : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="h-4 w-4 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH READER OR DESK"
                className="editorial-input pl-9 py-1.5 text-xs uppercase tracking-wider"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-[0.16em] opacity-80">
                <tr>
                  <th className="px-4 py-3">READER</th>
                  <th className="px-4 py-3">DESK</th>
                  <th className="px-4 py-3">WINDOW</th>
                  <th className="px-4 py-3">TIME LEFT</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center meta-label">
                      NO RESERVATIONS MATCH THIS FILTER
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--card-hover)] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold uppercase">{r.student?.full_name || 'READER'}</div>
                        <div className="opacity-70">{r.student?.email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold">
                        {r.seat?.label}
                        <div className="font-sans font-normal text-[10px] opacity-70 uppercase">
                          F0{r.seat?.floor?.level} · {r.seat?.section}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        {new Date(r.start_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        //{' '}
                        {new Date(r.start_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {new Date(r.end_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {r.minutesLeft !== null && r.minutesLeft !== undefined
                          ? `${r.minutesLeft}M`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 border border-[var(--border-strong)] text-[10px] font-bold uppercase tracking-wider">
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {r.status === 'booked' && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleAction(r.id, 'checkin')}
                                title="Manual Check-In"
                                className="btn-slide p-1.5"
                              >
                                <LogIn className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleAction(r.id, 'cancel')}
                                title="Cancel Booking"
                                className="p-1.5 border border-rose-400/70 text-rose-300 hover:bg-rose-600 hover:text-white"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {r.status === 'checked_in' && (
                            <button
                              type="button"
                              onClick={() => void handleAction(r.id, 'checkout')}
                              className="btn-slide btn-slide-solid px-2.5 py-1 text-[10px]"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> OUT
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
