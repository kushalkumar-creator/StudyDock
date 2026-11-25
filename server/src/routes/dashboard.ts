import { Router } from 'express';
import { env } from '../config/env.js';
import { serverCache } from '../lib/cache.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/public
 * Cached 30s — ultra-fast summary for the home hero, marquee, and AppShell announcements.
 */
dashboardRouter.get('/public', async (_req, res) => {
  try {
    const payload = await serverCache.getOrSet('dashboard:public', 30_000, async () => {
      const supabase = getSupabaseAdmin();
      const nowIso = new Date().toISOString();

      const [
        { data: announcements },
        { data: featuredBooks },
        { data: floors },
        { data: seats },
        { data: activeNow },
        { count: totalBooksCount },
      ] = await Promise.all([
        supabase
          .from('announcements')
          .select('id, message, level, created_at')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('books')
          .select('id, title, author, category, cover_url, status, shelf_location, published_year, isbn')
          .eq('featured_in_hero', true)
          .limit(5),
        supabase.from('floors').select('id, name, level').order('level'),
        supabase.from('seats').select('id, floor_id, is_blocked'),
        supabase
          .from('bookings')
          .select('seat_id, status')
          .in('status', ['booked', 'checked_in'])
          .lte('start_at', nowIso)
          .gte('end_at', nowIso),
        supabase.from('books').select('id', { count: 'exact', head: true }),
      ]);

      const totalSeats = (seats ?? []).filter((s) => !s.is_blocked).length;
      const busySeatIds = new Set((activeNow ?? []).map((b) => b.seat_id));

      const floorSummary = (floors ?? []).map((f) => {
        const floorSeats = (seats ?? []).filter((s) => s.floor_id === f.id && !s.is_blocked);
        const free = floorSeats.filter((s) => !busySeatIds.has(s.id)).length;
        return {
          level: f.level,
          name: f.name,
          total: floorSeats.length,
          available: free,
        };
      });

      return {
        announcements: announcements ?? [],
        featuredBooks: featuredBooks ?? [],
        floors: floorSummary,
        totalBooks: totalBooksCount ?? 0,
        liveStats: {
          totalSeats,
          availableNow: Math.max(0, totalSeats - busySeatIds.size),
          occupiedNow: (activeNow ?? []).filter((b) => b.status === 'checked_in').length,
        },
      };
    });

    res.json(payload);
  } catch (err) {
    console.error('[dashboard] GET /public error:', err);
    res.status(500).json({ error: 'Failed to load public library summary.' });
  }
});

/**
 * GET /api/dashboard/student
 * Occupancy ring, stat cards, floor-wise availability, upcoming bookings,
 * busy-time chart + friendly insight text.
 */
dashboardRouter.get(
  '/student',
  verifySupabaseJWT,
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const now = new Date();
      const nowIso = now.toISOString();
      const weekAgoIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const twoWeeksAgoIso = new Date(now.getTime() - 14 * 86_400_000).toISOString();

      const [
        sharedStatic,
        { data: activeNowBookings },
        { data: myUpcoming },
        { data: myWeekBookings },
        { data: myActiveBooks },
      ] = await Promise.all([
        serverCache.getOrSet('dashboard:student_shared', 60_000, async () => {
          const [
            { data: floorsData },
            { data: seatsData },
            { data: snapshotsData },
            { data: announcementsData },
            { data: settingsData },
          ] = await Promise.all([
            supabase.from('floors').select('*').order('level'),
            supabase.from('seats').select('id, floor_id, is_blocked'),
            supabase
              .from('occupancy_snapshots')
              .select('taken_at, occupied_count, total_seats')
              .gte('taken_at', twoWeeksAgoIso)
              .order('taken_at', { ascending: true })
              .limit(1000),
            supabase
              .from('announcements')
              .select('id, message, level, created_at')
              .eq('active', true)
              .order('created_at', { ascending: false })
              .limit(3),
            supabase.from('settings').select('open_time, close_time, timezone').eq('id', 1).single(),
          ]);
          return {
            floors: floorsData ?? [],
            seats: seatsData ?? [],
            snapshots: snapshotsData ?? [],
            announcements: announcementsData ?? [],
            settings: settingsData ?? null,
          };
        }),
        supabase
          .from('bookings')
          .select('seat_id, status')
          .in('status', ['booked', 'checked_in'])
          .lte('start_at', nowIso)
          .gte('end_at', nowIso),
        supabase
          .from('bookings')
          .select('id, start_at, end_at, status, seat:seats(id, label, section, floor:floors(name, level))')
          .eq('user_id', req.user!.id)
          .in('status', ['booked', 'checked_in'])
          .gte('end_at', nowIso)
          .order('start_at', { ascending: true })
          .limit(5),
        supabase
          .from('bookings')
          .select('start_at, end_at, status')
          .eq('user_id', req.user!.id)
          .in('status', ['booked', 'checked_in', 'completed'])
          .gte('start_at', weekAgoIso),
        supabase
          .from('book_issues')
          .select('id, status, due_at, pickup_expires_at, book:books(id, title, author)')
          .eq('user_id', req.user!.id)
          .in('status', ['pending_pickup', 'borrowed']),
      ]);

      const { floors, seats, snapshots, announcements, settings } = sharedStatic;

      const activeBySeat = new Map<string, string>();
      for (const b of activeNowBookings ?? []) {
        activeBySeat.set(b.seat_id, b.status);
      }

      const floorAvailability = (floors ?? []).map((floor) => {
        const floorSeats = (seats ?? []).filter((s) => s.floor_id === floor.id);
        const blocked = floorSeats.filter((s) => s.is_blocked).length;
        const usableSeats = floorSeats.filter((s) => !s.is_blocked);
        let occupied = 0;
        let reserved = 0;
        for (const s of usableSeats) {
          const st = activeBySeat.get(s.id);
          if (st === 'checked_in') occupied++;
          else if (st === 'booked') reserved++;
        }
        const total = usableSeats.length;
        const available = Math.max(0, total - occupied - reserved);
        return {
          floor_id: floor.id,
          name: floor.name,
          level: floor.level,
          total,
          available,
          reserved,
          occupied,
          blocked,
          occupancyPct: total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0,
        };
      });

      const totals = floorAvailability.reduce(
        (acc, f) => ({
          total: acc.total + f.total,
          available: acc.available + f.available,
          reserved: acc.reserved + f.reserved,
          occupied: acc.occupied + f.occupied,
        }),
        { total: 0, available: 0, reserved: 0, occupied: 0 },
      );

      const hoursThisWeek = Number(
        (
          (myWeekBookings ?? []).reduce(
            (sum, b) => sum + Math.max(0, (Date.parse(b.end_at) - Date.parse(b.start_at)) / 3600_000),
            0,
          )
        ).toFixed(1),
      );

      // Aggregate busy-time chart by hour (8..21) in library timezone
      const tz = settings?.timezone || env.timezone;
      const hourBuckets = new Map<number, { pctSum: number; count: number }>();
      const hourFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hourCycle: 'h23',
      });

      for (const snap of snapshots ?? []) {
        const hr = Number(hourFmt.format(new Date(snap.taken_at)));
        const pct = snap.total_seats > 0 ? (snap.occupied_count / snap.total_seats) * 100 : 0;
        const bucket = hourBuckets.get(hr) ?? { pctSum: 0, count: 0 };
        bucket.pctSum += pct;
        bucket.count += 1;
        hourBuckets.set(hr, bucket);
      }

      const formatHour = (h: number) => {
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12} ${suffix}`;
      };

      const busyTimeChart = Array.from({ length: 14 }, (_, idx) => {
        const hour = idx + 8;
        const bucket = hourBuckets.get(hour);
        const avgOccupancy = bucket ? Math.round(bucket.pctSum / bucket.count) : 0;
        return {
          hour,
          label: formatHour(hour),
          occupancyPct: avgOccupancy,
        };
      });

      // Compute friendly insight ("Usually quiet at 2 PM, busiest around 4 PM")
      const populated = busyTimeChart.filter((d) => d.occupancyPct > 0);
      let insight = 'Live occupancy updates every 2 minutes.';
      if (populated.length > 0) {
        const quietest = populated.reduce((min, cur) =>
          cur.occupancyPct < min.occupancyPct ? cur : min,
        );
        const busiest = populated.reduce((max, cur) =>
          cur.occupancyPct > max.occupancyPct ? cur : max,
        );
        insight = `Usually quiet around ${quietest.label} (${quietest.occupancyPct}% full) · Peak traffic around ${busiest.label} (${busiest.occupancyPct}% full).`;
      }

      res.json({
        occupancy: {
          ...totals,
          occupancyPct:
            totals.total > 0
              ? Math.round(((totals.occupied + totals.reserved) / totals.total) * 100)
              : 0,
        },
        floorAvailability,
        stats: {
          activeBookingsCount: (myUpcoming ?? []).length,
          hoursThisWeek,
          booksIssuedCount: (myActiveBooks ?? []).length,
        },
        upcomingBookings: myUpcoming ?? [],
        activeBooks: myActiveBooks ?? [],
        busyTimeChart,
        insight,
        announcements: announcements ?? [],
        settings,
      });
    } catch (err) {
      console.error('[dashboard] GET /student error:', err);
      res.status(500).json({ error: 'Failed to load student dashboard.' });
    }
  },
);
