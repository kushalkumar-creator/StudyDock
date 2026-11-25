import {
  Bell,
  BookOpen,
  CalendarClock,
  Clock,
  Layers,
  MapPin,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiFetchCached, getApiCache, prefetchApi } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { getDefaultBookingWindow } from './BookSeat';

interface StudentDashboardData {
  occupancy: {
    total: number;
    available: number;
    reserved: number;
    occupied: number;
    occupancyPct: number;
  };
  floorAvailability: Array<{
    floor_id: string;
    name: string;
    level: number;
    total: number;
    available: number;
    reserved: number;
    occupied: number;
    occupancyPct: number;
  }>;
  stats: {
    activeBookingsCount: number;
    hoursThisWeek: number;
    booksIssuedCount: number;
  };
  upcomingBookings: Array<{
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    seat?: { label: string; section: string; floor?: { name: string; level: number } };
  }>;
  activeBooks: Array<{
    id: string;
    status: string;
    due_at?: string | null;
    pickup_expires_at: string;
    book?: { id: string; title: string; author: string };
  }>;
  busyTimeChart: Array<{ hour: number; label: string; occupancyPct: number }>;
  insight: string;
  announcements?: Array<{ id: string; message: string; level: string; created_at: string }>;
}

export function Dashboard() {
  const { profile } = useAuth();
  const { theme } = useTheme();
  const [data, setData] = useState<StudentDashboardData | null>(
    () => getApiCache<StudentDashboardData>('/api/dashboard/student') ?? null,
  );
  const [loading, setLoading] = useState(!getApiCache('/api/dashboard/student'));
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadDashboard = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await apiFetchCached<StudentDashboardData>('/api/dashboard/student', {
        maxAgeMs: 20_000,
        force,
      });
      setData(res);
      setLastUpdated(new Date());
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
    // Warm up other student routes in the background so tab clicks feel instant
    prefetchApi(getDefaultBookingWindow().path);
    prefetchApi('/api/bookings/mine');
    prefetchApi('/api/books', true);
    prefetchApi('/api/books/mine');
    const timer = setInterval(() => void loadDashboard(true), 120_000);
    return () => clearInterval(timer);
  }, [loadDashboard]);

  useRealtime(['bookings', 'seats', 'books', 'announcements'], () => {
    void loadDashboard(true);
  });

  const pct = data?.occupancy.occupancyPct ?? 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const chartStroke = theme === 'dark' ? '#F0EDE5' : '#004643';
  const chartGrid = theme === 'dark' ? 'rgba(240,237,229,0.12)' : 'rgba(0,70,67,0.12)';

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label flex items-center gap-2">
              <span className="status-pulse" />
              // 01. READER DASHBOARD · SYNCED{' '}
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1">
              WELCOME, {profile?.full_name?.split(' ')[0] || 'SCHOLAR'}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              className="btn-slide px-3.5 py-2.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
            <Link to="/book" className="btn-slide btn-slide-solid px-4 py-2.5 text-xs">
              <MapPin className="h-3.5 w-3.5" /> RESERVE DESK →
            </Link>
          </div>
        </div>

        {/* Active Library Notices */}
        {(data?.announcements ?? []).length > 0 && (
          <div className="editorial-card border-[var(--border-strong)] p-4 space-y-2">
            <div className="meta-label flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> ACTIVE LIBRARY NOTICES
            </div>
            <div className="space-y-1.5">
              {data!.announcements!.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2.5 text-xs font-semibold border-l-2 border-[var(--text-primary)] pl-3 py-0.5"
                >
                  <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 border border-[var(--border-strong)]">
                    {a.level}
                  </span>
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Occupancy Ring + Stat Cards */}
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 editorial-card p-6 flex items-center gap-6">
            <div className="relative h-36 w-36 shrink-0 flex items-center justify-center">
              <svg className="h-36 w-36 -rotate-90" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.18}
                  strokeWidth="10"
                />
                <circle
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute text-center">
                <div className="font-poster text-3xl">{pct}%</div>
                <div className="meta-label text-[9px]">FULL</div>
              </div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="meta-label">LIVE HALL STATUS</div>
              <div className="font-poster text-3xl">
                {data?.occupancy.available ?? '—'} FREE
              </div>
              <div className="text-xs opacity-75">
                {data?.occupancy.occupied ?? 0} inside · {data?.occupancy.reserved ?? 0} reserved
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 grid sm:grid-cols-3 gap-4">
            <div className="editorial-card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="meta-label">ACTIVE BOOKINGS</span>
                <CalendarClock className="h-4 w-4 opacity-70" />
              </div>
              <div className="mt-4">
                <div className="font-poster text-5xl">
                  {data?.stats.activeBookingsCount ?? 0}
                </div>
                <Link
                  to="/reservations"
                  className="text-[11px] font-bold tracking-[0.14em] uppercase underline underline-offset-4 mt-2 inline-block opacity-85 hover:opacity-100"
                >
                  VIEW PASSES →
                </Link>
              </div>
            </div>

            <div className="editorial-card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="meta-label">HOURS THIS WEEK</span>
                <Clock className="h-4 w-4 opacity-70" />
              </div>
              <div className="mt-4">
                <div className="font-poster text-5xl">{data?.stats.hoursThisWeek ?? 0}H</div>
                <p className="text-xs opacity-70 mt-2 uppercase tracking-wider">Reserved focus time</p>
              </div>
            </div>

            <div className="editorial-card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="meta-label">VOLUMES ISSUED</span>
                <BookOpen className="h-4 w-4 opacity-70" />
              </div>
              <div className="mt-4">
                <div className="font-poster text-5xl">{data?.stats.booksIssuedCount ?? 0}</div>
                <Link
                  to="/books"
                  className="text-[11px] font-bold tracking-[0.14em] uppercase underline underline-offset-4 mt-2 inline-block opacity-85 hover:opacity-100"
                >
                  OPEN CATALOG →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Floor Availability + Upcoming Reservations */}
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 editorial-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="font-poster text-2xl flex items-center gap-2">
                <Layers className="h-5 w-5" /> FLOOR AVAILABILITY
              </h2>
              <span className="meta-label">3 LEVELS</span>
            </div>
            <div className="space-y-4">
              {(data?.floorAvailability ?? []).map((floor) => (
                <div key={floor.floor_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold tracking-[0.1em] uppercase">
                    <span>
                      FLOOR 0{floor.level} — {floor.name.split('—')[1]?.trim() || floor.name}
                    </span>
                    <span className="font-mono">
                      {floor.available}/{floor.total} FREE
                    </span>
                  </div>
                  <div className="h-3 w-full border border-[var(--border-strong)] bg-[var(--bg-primary)]">
                    <div
                      className="h-full bg-[var(--text-primary)] transition-all duration-500"
                      style={{ width: `${Math.max(4, floor.occupancyPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 editorial-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 className="font-poster text-2xl flex items-center gap-2">
                <CalendarClock className="h-5 w-5" /> UPCOMING DESKS
              </h2>
              <Link
                to="/reservations"
                className="text-[11px] font-bold tracking-[0.14em] uppercase underline underline-offset-4"
              >
                MANAGE ALL
              </Link>
            </div>
            {(data?.upcomingBookings ?? []).length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] opacity-75">
                  No upcoming desk reservations scheduled.
                </p>
                <Link to="/book" className="btn-slide btn-slide-solid px-4 py-2 text-xs">
                  CLAIM A DESK →
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data!.upcomingBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 border border-[var(--border-color)] bg-[var(--bg-primary)]/50 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-mono font-bold text-sm">{b.seat?.label}</div>
                      <div className="text-xs opacity-75 uppercase tracking-wider">
                        {b.seat?.floor?.name} · {b.seat?.section}
                      </div>
                    </div>
                    <div className="text-right text-xs font-mono">
                      <div className="font-bold">
                        {new Date(b.start_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {new Date(b.end_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="opacity-70">
                        {new Date(b.start_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Busy-Time Chart */}
        <div className="editorial-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
            <div>
              <h2 className="font-poster text-2xl">TRAFFIC CADENCE // BUSY HOURS</h2>
              <p className="text-xs opacity-80 flex items-center gap-1.5 mt-1 uppercase tracking-[0.1em]">
                <Sparkles className="h-3.5 w-3.5" />
                {data?.insight || 'Analyzing reading hall occupancy snapshots…'}
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.busyTimeChart ?? []}>
                <defs>
                  <linearGradient id="cyprusArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartStroke} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartStroke} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartStroke }} stroke={chartGrid} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: chartStroke }} stroke={chartGrid} />
                <Tooltip
                  formatter={(v: number) => [`${v}% FULL`, 'AVG OCCUPANCY']}
                  contentStyle={{
                    borderRadius: '0px',
                    border: `1px solid ${chartStroke}`,
                    backgroundColor: theme === 'dark' ? '#00312F' : '#F0EDE5',
                    color: chartStroke,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="occupancyPct"
                  stroke={chartStroke}
                  strokeWidth={2.5}
                  fill="url(#cyprusArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
