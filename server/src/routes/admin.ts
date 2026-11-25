import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { serverCache } from '../lib/cache.js';
import { broadcastUpdate } from '../lib/realtime.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import { sendBookingCancellationEmail, sendTestEmail } from '../services/email.js';
import { generateReservationsExcel, type ReservationExportRow } from '../services/export.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const adminRouter = Router();

adminRouter.use(verifySupabaseJWT, requireRole('admin'));

/**
 * GET /api/admin/overview
 * Summary KPIs, floor occupancy, who is currently inside, and recent gate scans.
 */
adminRouter.get('/overview', async (_req, res) => {
  try {
    const payload = await serverCache.getOrSet('admin:overview', 20_000, async () => {
      const supabase = getSupabaseAdmin();
      const now = new Date();
      const nowIso = now.toISOString();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const [
        layout,
        { data: activeBookings },
        { data: todayBookings },
        { data: checkedInNow },
        { data: activeBooks },
        { data: recentGateLogs },
      ] = await Promise.all([
        serverCache.getOrSet('layout:floors_seats', 60_000, async () => {
          const [{ data: fData }, { data: sData }] = await Promise.all([
            supabase.from('floors').select('*').order('level', { ascending: true }),
            supabase.from('seats').select('*').order('label', { ascending: true }),
          ]);
          return { floors: fData ?? [], seats: sData ?? [] };
        }),
        supabase
          .from('bookings')
          .select('seat_id, status')
          .in('status', ['booked', 'checked_in'])
          .lte('start_at', nowIso)
          .gte('end_at', nowIso),
        supabase.from('bookings').select('id, status').gte('start_at', startOfDay.toISOString()),
        supabase
          .from('bookings')
          .select(
            `
            id, start_at, end_at, checked_in_at, status,
            student:profiles!bookings_user_id_fkey(id, full_name, email),
            seat:seats(id, label, section, floor:floors(name, level))
          `,
          )
          .eq('status', 'checked_in')
          .order('checked_in_at', { ascending: false }),
        supabase.from('book_issues').select('id, status').in('status', ['pending_pickup', 'borrowed']),
        supabase
          .from('gate_logs')
          .select(
            'id, method, result, created_at, booking:bookings(seat:seats(label), student:profiles!bookings_user_id_fkey(full_name))',
          )
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      const { floors, seats } = layout;
      const activeBySeat = new Map<string, string>();
      for (const b of activeBookings ?? []) activeBySeat.set(b.seat_id, b.status);

      const floorOccupancy = floors.map((floor) => {
        const floorSeats = seats.filter((s) => s.floor_id === floor.id);
        const blocked = floorSeats.filter((s) => s.is_blocked).length;
        const usable = floorSeats.filter((s) => !s.is_blocked);
        let occupied = 0;
        let reserved = 0;
        for (const s of usable) {
          const st = activeBySeat.get(s.id);
          if (st === 'checked_in') occupied++;
          else if (st === 'booked') reserved++;
        }
        const total = usable.length;
        return {
          floor_id: floor.id,
          name: floor.name,
          level: floor.level,
          total,
          available: Math.max(0, total - occupied - reserved),
          reserved,
          occupied,
          blocked,
          occupancyPct: total > 0 ? Math.round(((occupied + reserved) / total) * 100) : 0,
        };
      });

      const totalUsableSeats = seats.filter((s) => !s.is_blocked).length;
      const totalCheckedIn = (checkedInNow ?? []).length;
      const todayTotal = (todayBookings ?? []).length;
      const todayNoShows = (todayBookings ?? []).filter((b) => b.status === 'no_show').length;

      return {
        stats: {
          insideNow: totalCheckedIn,
          totalUsableSeats,
          blockedSeats: seats.filter((s) => s.is_blocked).length,
          todayBookings: todayTotal,
          todayNoShows,
          activeBookIssues: (activeBooks ?? []).length,
        },
        floorOccupancy,
        insideNow: (checkedInNow ?? []).map((b) => ({
          ...b,
          minutesLeft: Math.max(0, Math.round((Date.parse(b.end_at) - Date.now()) / 60_000)),
        })),
        recentGateLogs: recentGateLogs ?? [],
      };
    });

    res.json(payload);
  } catch (err) {
    console.error('[admin] GET /overview error:', err);
    res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

/**
 * GET /api/admin/reservations?tab=all|upcoming|booked|checked_in&search=&floor=&date=
 */
adminRouter.get('/reservations', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { tab = 'all', search, floor, date } = req.query as {
      tab?: string;
      search?: string;
      floor?: string;
      date?: string;
    };

    const nowIso = new Date().toISOString();
    let query = supabase
      .from('bookings')
      .select(
        `
        id, user_id, seat_id, start_at, end_at, status, checked_in_at, checked_out_at, created_at,
        student:profiles!bookings_user_id_fkey(id, full_name, email),
        seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))
      `,
      )
      .order('start_at', { ascending: false })
      .limit(300);

    if (tab === 'upcoming') {
      query = query.eq('status', 'booked').gt('start_at', nowIso);
    } else if (tab === 'booked') {
      query = query.eq('status', 'booked');
    } else if (tab === 'checked_in') {
      query = query.eq('status', 'checked_in');
    }

    if (date) {
      query = query.gte('start_at', `${date}T00:00:00.000Z`).lte('start_at', `${date}T23:59:59.999Z`);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let rows = (data ?? []).map((row) => {
      const endMs = Date.parse(row.end_at);
      const startMs = Date.parse(row.start_at);
      const nowMs = Date.now();
      let minutesLeft: number | null = null;
      if (row.status === 'checked_in' || (row.status === 'booked' && nowMs >= startMs && nowMs <= endMs)) {
        minutesLeft = Math.max(0, Math.round((endMs - nowMs) / 60_000));
      } else if (row.status === 'booked' && nowMs < startMs) {
        minutesLeft = Math.round((endMs - startMs) / 60_000);
      }
      return { ...row, minutesLeft };
    });

    if (floor && floor !== 'all') {
      rows = rows.filter((r) => {
        const seat = r.seat as unknown as { floor?: { id: string; level: number } } | null;
        return seat?.floor?.id === floor || String(seat?.floor?.level) === floor;
      });
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const student = r.student as unknown as { full_name?: string; email?: string } | null;
        const seat = r.seat as unknown as { label?: string; section?: string } | null;
        return (
          (student?.full_name ?? '').toLowerCase().includes(q) ||
          (student?.email ?? '').toLowerCase().includes(q) ||
          (seat?.label ?? '').toLowerCase().includes(q) ||
          (seat?.section ?? '').toLowerCase().includes(q)
        );
      });
    }

    res.json({ reservations: rows });
  } catch (err) {
    console.error('[admin] GET /reservations error:', err);
    res.status(500).json({ error: 'Failed to load reservations.' });
  }
});

adminRouter.post('/reservations/:id/checkin', async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'checked_in', checked_in_at: nowIso, used_at: nowIso })
      .eq('id', req.params.id)
      .eq('status', 'booked')
      .select('*')
      .maybeSingle();

    if (error || !data) {
      res.status(400).json({ error: 'Booking cannot be checked in.' });
      return;
    }

    await supabase.from('gate_logs').insert({
      booking_id: data.id,
      verified_by: req.user!.id,
      method: 'manual_checkin',
      result: 'VALID',
    });

    broadcastUpdate(['bookings', 'seats']);
    res.json({ booking: data });
  } catch (err) {
    console.error('[admin] manual checkin error:', err);
    res.status(500).json({ error: 'Check-in failed.' });
  }
});

adminRouter.post('/reservations/:id/checkout', async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'completed', checked_out_at: nowIso })
      .eq('id', req.params.id)
      .eq('status', 'checked_in')
      .select('*')
      .maybeSingle();

    if (error || !data) {
      res.status(400).json({ error: 'Only currently checked-in bookings can be checked out.' });
      return;
    }

    await supabase.from('gate_logs').insert({
      booking_id: data.id,
      verified_by: req.user!.id,
      method: 'manual_checkout',
      result: 'CHECKED_OUT',
    });

    broadcastUpdate(['bookings', 'seats']);
    res.json({ booking: data });
  } catch (err) {
    console.error('[admin] checkout error:', err);
    res.status(500).json({ error: 'Check-out failed.' });
  }
});

adminRouter.delete('/reservations/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, start_at, status, student:profiles!bookings_user_id_fkey(full_name, email), seat:seats(label)')
      .eq('id', req.params.id)
      .single();

    if (!booking) {
      res.status(404).json({ error: 'Reservation not found.' });
      return;
    }

    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);

    const student = booking.student as unknown as { full_name?: string; email?: string } | null;
    const seat = booking.seat as unknown as { label?: string } | null;
    if (student?.email) {
      void sendBookingCancellationEmail({
        to: student.email,
        studentName: student.full_name || 'Student',
        seatLabel: seat?.label || 'Seat',
        startAt: booking.start_at,
        reason: 'Cancelled by library administrator.',
      });
    }

    broadcastUpdate(['bookings', 'seats']);
    res.json({ cancelled: true });
  } catch (err) {
    console.error('[admin] delete reservation error:', err);
    res.status(500).json({ error: 'Failed to cancel reservation.' });
  }
});

/**
 * GET /api/admin/analytics
 * Peak hours, busiest floors, no-show rate, and daily booking trend.
 */
adminRouter.get('/analytics', async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [{ data: bookings }, { data: floors }, { data: snapshots }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, start_at, end_at, status, seat:seats(floor_id)')
        .gte('start_at', thirtyDaysAgo),
      supabase.from('floors').select('id, name, level').order('level'),
      supabase
        .from('occupancy_snapshots')
        .select('floor_id, taken_at, occupied_count, total_seats')
        .gte('taken_at', thirtyDaysAgo)
        .limit(3000),
    ]);

    const all = bookings ?? [];
    const finalized = all.filter((b) => ['checked_in', 'completed', 'no_show'].includes(b.status));
    const noShows = all.filter((b) => b.status === 'no_show').length;
    const noShowRate = finalized.length > 0 ? Math.round((noShows / finalized.length) * 100) : 0;

    // Peak hours from snapshots + bookings
    const hourFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: env.timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    });

    const hourMap = new Map<number, { bookings: number; occSum: number; occCount: number }>();
    for (let h = 8; h <= 21; h++) hourMap.set(h, { bookings: 0, occSum: 0, occCount: 0 });

    for (const b of all) {
      const hr = Number(hourFmt.format(new Date(b.start_at)));
      const entry = hourMap.get(hr);
      if (entry) entry.bookings += 1;
    }

    for (const s of snapshots ?? []) {
      const hr = Number(hourFmt.format(new Date(s.taken_at)));
      const entry = hourMap.get(hr);
      if (entry && s.total_seats > 0) {
        entry.occSum += (s.occupied_count / s.total_seats) * 100;
        entry.occCount += 1;
      }
    }

    const peakHours = Array.from(hourMap.entries()).map(([hour, v]) => ({
      hour,
      label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour >= 12 ? 'PM' : 'AM'}`,
      bookings: v.bookings,
      avgOccupancyPct: v.occCount > 0 ? Math.round(v.occSum / v.occCount) : 0,
    }));

    const floorCounts = new Map<string, number>();
    for (const b of all) {
      const fid = (b.seat as unknown as { floor_id?: string })?.floor_id;
      if (fid) floorCounts.set(fid, (floorCounts.get(fid) ?? 0) + 1);
    }

    const busiestFloors = (floors ?? []).map((f) => ({
      floor_id: f.id,
      name: f.name,
      level: f.level,
      bookings: floorCounts.get(f.id) ?? 0,
    }));

    // Daily trend over last 14 days
    const dayFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: env.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dailyMap = new Map<string, { total: number; noShow: number; completed: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = dayFmt.format(new Date(Date.now() - i * 86_400_000));
      dailyMap.set(d, { total: 0, noShow: 0, completed: 0 });
    }
    for (const b of all) {
      const d = dayFmt.format(new Date(b.start_at));
      const slot = dailyMap.get(d);
      if (slot) {
        slot.total += 1;
        if (b.status === 'no_show') slot.noShow += 1;
        if (b.status === 'completed' || b.status === 'checked_in') slot.completed += 1;
      }
    }

    const dailyTrend = Array.from(dailyMap.entries()).map(([date, stats]) => ({
      date: date.slice(5),
      ...stats,
    }));

    res.json({
      summary: {
        totalBookings30d: all.length,
        noShowCount: noShows,
        noShowRate,
        completionRate:
          finalized.length > 0
            ? Math.round(((finalized.length - noShows) / finalized.length) * 100)
            : 100,
      },
      peakHours,
      busiestFloors,
      dailyTrend,
    });
  } catch (err) {
    console.error('[admin] GET /analytics error:', err);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

/**
 * GET /api/admin/export
 * Generates an Excel workbook (.xlsx) of reservations.
 */
adminRouter.get('/export', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { from, to, status } = req.query as { from?: string; to?: string; status?: string };

    let query = supabase
      .from('bookings')
      .select(
        `
        id, start_at, end_at, status, checked_in_at, checked_out_at,
        student:profiles!bookings_user_id_fkey(full_name, email),
        seat:seats(label, section, floor:floors(name))
      `,
      )
      .order('start_at', { ascending: false })
      .limit(2000);

    if (from) query = query.gte('start_at', new Date(from).toISOString());
    if (to) query = query.lte('start_at', new Date(to).toISOString());
    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows: ReservationExportRow[] = (data ?? []).map((b) => {
      const student = b.student as unknown as { full_name?: string; email?: string } | null;
      const seat = b.seat as unknown as {
        label?: string;
        section?: string;
        floor?: { name?: string };
      } | null;
      return {
        id: b.id,
        student_name: student?.full_name ?? 'Unknown',
        student_email: student?.email ?? '—',
        floor_name: seat?.floor?.name ?? '—',
        section: seat?.section ?? '—',
        seat_label: seat?.label ?? '—',
        start_at: b.start_at,
        end_at: b.end_at,
        status: b.status,
        checked_in_at: b.checked_in_at,
        checked_out_at: b.checked_out_at,
      };
    });

    const buffer = await generateReservationsExcel(rows);
    const filename = `library-reservations-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[admin] GET /export error:', err);
    res.status(500).json({ error: 'Failed to export Excel report.' });
  }
});

// ===================== SETTINGS & HOLIDAYS =====================

adminRouter.get('/settings', async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: settings }, { data: holidays }] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('holidays').select('*').order('date', { ascending: true }),
    ]);
    res.json({ settings, holidays: holidays ?? [] });
  } catch (err) {
    console.error('[admin] GET /settings error:', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

const settingsSchema = z.object({
  open_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  close_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  max_bookings_per_day: z.number().int().min(1).max(10),
  max_hours_per_day: z.number().min(1).max(24),
  early_entry_min: z.number().int().min(0).max(60),
  no_show_min: z.number().int().min(5).max(60),
  book_limit: z.number().int().min(1).max(10),
  book_pickup_hours: z.number().int().min(1).max(168).optional(),
  book_loan_days: z.number().int().min(1).max(90).optional(),
  allowed_email_domain: z.string().max(120).optional(),
});

adminRouter.put('/settings', async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('settings')
      .upsert({ id: 1, ...parsed.data }, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    broadcastUpdate(['settings']);
    res.json({ settings: data });
  } catch (err) {
    console.error('[admin] PUT /settings error:', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

adminRouter.post('/holidays', async (req, res) => {
  try {
    const parsed = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        label: z.string().trim().min(2).max(100),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid YYYY-MM-DD date and label.' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('holidays')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(201).json({ holiday: data });
  } catch (err) {
    console.error('[admin] POST /holidays error:', err);
    res.status(500).json({ error: 'Failed to add holiday.' });
  }
});

adminRouter.delete('/holidays/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('holidays').delete().eq('id', req.params.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    broadcastUpdate(['announcements']);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[admin] DELETE /holidays error:', err);
    res.status(500).json({ error: 'Failed to remove holiday.' });
  }
});

// ===================== MAINTENANCE BLOCKS =====================

/**
 * POST /api/admin/blocks
 * Block or unblock a single seat OR an entire table.
 * When blocking, cancels active future bookings on those seats and notifies affected students.
 */
adminRouter.post('/blocks', async (req, res) => {
  try {
    const schema = z
      .object({
        seatId: z.string().uuid().optional(),
        floorId: z.string().uuid().optional(),
        tableNo: z.string().min(1).optional(),
        isBlocked: z.boolean(),
        reason: z.string().trim().max(200).optional(),
      })
      .refine((v) => v.seatId || (v.floorId && v.tableNo), {
        message: 'Specify either seatId or both floorId and tableNo.',
      });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid block request.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { seatId, floorId, tableNo, isBlocked, reason } = parsed.data;

    let query = supabase
      .from('seats')
      .update({
        is_blocked: isBlocked,
        block_reason: isBlocked ? reason || 'Maintenance' : null,
      })
      .select('id, label');

    if (seatId) {
      query = query.eq('id', seatId);
    } else {
      query = query.eq('floor_id', floorId!).eq('table_no', tableNo!);
    }

    const { data: updatedSeats, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let cancelledCount = 0;
    if (isBlocked && updatedSeats && updatedSeats.length > 0) {
      const seatIds = updatedSeats.map((s) => s.id);
      const { data: impacted } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .in('seat_id', seatIds)
        .eq('status', 'booked')
        .gte('end_at', new Date().toISOString())
        .select('id, start_at, seat:seats(label), student:profiles!bookings_user_id_fkey(full_name, email)');

      cancelledCount = (impacted ?? []).length;
      for (const b of impacted ?? []) {
        const student = b.student as unknown as { full_name?: string; email?: string } | null;
        const seat = b.seat as unknown as { label?: string } | null;
        if (student?.email) {
          void sendBookingCancellationEmail({
            to: student.email,
            studentName: student.full_name || 'Student',
            seatLabel: seat?.label || 'Seat',
            startAt: b.start_at,
            reason: `Seat blocked for maintenance${reason ? `: ${reason}` : '.'}`,
          });
        }
      }
    }

    broadcastUpdate(['seats', 'bookings']);

    res.json({
      updatedSeats: updatedSeats ?? [],
      cancelledBookings: cancelledCount,
    });
  } catch (err) {
    console.error('[admin] POST /blocks error:', err);
    res.status(500).json({ error: 'Failed to update seat maintenance block.' });
  }
});

// ===================== ANNOUNCEMENTS =====================

adminRouter.get('/announcements', async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ announcements: data ?? [] });
  } catch (err) {
    console.error('[admin] GET /announcements error:', err);
    res.status(500).json({ error: 'Failed to load announcements.' });
  }
});

adminRouter.post('/announcements', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = z
      .object({
        message: z.string().trim().min(3).max(300),
        level: z.enum(['info', 'warning', 'urgent']).default('info'),
        active: z.boolean().default(true),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid announcement.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        ...parsed.data,
        created_by: req.user!.id,
      })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    broadcastUpdate(['announcements']);
    res.status(201).json({ announcement: data });
  } catch (err) {
    console.error('[admin] POST /announcements error:', err);
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

adminRouter.patch('/announcements/:id', async (req, res) => {
  try {
    const parsed = z
      .object({
        message: z.string().trim().min(3).max(300).optional(),
        level: z.enum(['info', 'warning', 'urgent']).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update.' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('announcements')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    broadcastUpdate(['announcements']);
    res.json({ announcement: data });
  } catch (err) {
    console.error('[admin] PATCH /announcements error:', err);
    res.status(500).json({ error: 'Failed to update announcement.' });
  }
});

adminRouter.delete('/announcements/:id', async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('announcements').delete().eq('id', req.params.id);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    broadcastUpdate(['announcements']);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[admin] DELETE /announcements error:', err);
    res.status(500).json({ error: 'Failed to delete announcement.' });
  }
});

adminRouter.post('/test-email', async (req: AuthenticatedRequest, res) => {
  const target =
    typeof req.body?.to === 'string' && req.body.to.includes('@')
      ? req.body.to.trim()
      : req.user!.email;
  const result = await sendTestEmail(target);
  if (!result.sent) {
    res.status(400).json({ error: result.error || 'Failed to send test email.' });
    return;
  }
  res.json({ sent: true, to: target });
});
