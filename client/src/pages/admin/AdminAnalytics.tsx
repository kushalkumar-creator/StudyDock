import { BarChart3, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../../components/AppShell';
import { useTheme } from '../../hooks/useTheme';
import { apiDownloadBlob, apiFetchCached, getApiCache } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';

interface AnalyticsPayload {
  summary: {
    totalBookings30d: number;
    noShowCount: number;
    noShowRate: number;
    completionRate: number;
  };
  peakHours: Array<{ hour: number; label: string; bookings: number; avgOccupancyPct: number }>;
  busiestFloors: Array<{ floor_id: string; name: string; level: number; bookings: number }>;
  dailyTrend: Array<{ date: string; total: number; noShow: number; completed: number }>;
}

export function AdminAnalytics() {
  const { theme } = useTheme();
  const [data, setData] = useState<AnalyticsPayload | null>(
    () => getApiCache<AnalyticsPayload>('/api/admin/analytics') ?? null,
  );

  const loadAnalytics = (force = false) => {
    apiFetchCached<AnalyticsPayload>('/api/admin/analytics', { maxAgeMs: 30_000, force })
      .then(setData)
      .catch(() => {
        // ignore
      });
  };

  useEffect(() => {
    loadAnalytics(false);
  }, []);

  useRealtime(['bookings', 'seats'], () => {
    loadAnalytics(true);
  });

  const ink = theme === 'dark' ? '#F0EDE5' : '#004643';
  const grid = theme === 'dark' ? 'rgba(240,237,229,0.14)' : 'rgba(0,70,67,0.14)';
  const tooltipStyle = {
    borderRadius: '0px',
    border: `1px solid ${ink}`,
    backgroundColor: theme === 'dark' ? '#00312F' : '#F0EDE5',
    color: ink,
    fontSize: '12px',
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label">// 04. 30-DAY OCCUPANCY INTELLIGENCE</div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1 flex items-center gap-3">
              <BarChart3 className="h-8 w-8" /> LIBRARY ANALYTICS
            </h1>
          </div>
          <button
            type="button"
            onClick={() =>
              void apiDownloadBlob(
                '/api/admin/export',
                `cyprus-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`,
              )
            }
            className="self-start btn-slide btn-slide-solid px-4 py-2.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> EXPORT EXCEL REPORT
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="editorial-card p-5">
            <div className="meta-label">BOOKINGS (30D)</div>
            <div className="font-poster text-5xl mt-2">
              {data?.summary.totalBookings30d ?? 0}
            </div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label">COMPLETION RATE</div>
            <div className="font-poster text-5xl mt-2">
              {data?.summary.completionRate ?? 100}%
            </div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label">NO-SHOW RATE</div>
            <div className="font-poster text-5xl mt-2">{data?.summary.noShowRate ?? 0}%</div>
          </div>
          <div className="editorial-card p-5">
            <div className="meta-label">AUTO-RELEASED</div>
            <div className="font-poster text-5xl mt-2">{data?.summary.noShowCount ?? 0}</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 editorial-card p-6 space-y-3">
            <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
              PEAK HOURS // AVG OCCUPANCY %
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.peakHours ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink }} stroke={grid} />
                  <YAxis unit="%" tick={{ fontSize: 11, fill: ink }} stroke={grid} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="avgOccupancyPct" name="Avg Occupancy %" fill={ink} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 editorial-card p-6 space-y-3">
            <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
              BUSIEST FLOORS
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.busiestFloors ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: ink }} stroke={grid} />
                  <YAxis
                    dataKey="level"
                    type="category"
                    tickFormatter={(v) => `FLOOR 0${v}`}
                    tick={{ fontSize: 11, fill: ink }}
                    stroke={grid}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="bookings" name="Reservations" fill={ink} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="editorial-card p-6 space-y-3">
          <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
            14-DAY RESERVATION &amp; NO-SHOW TREND
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.dailyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: ink }} stroke={grid} />
                <YAxis tick={{ fontSize: 11, fill: ink }} stroke={grid} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="total" name="Total" stroke={ink} strokeWidth={2.5} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#4ade80"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="noShow"
                  name="No-Show"
                  stroke="#fbbf24"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
