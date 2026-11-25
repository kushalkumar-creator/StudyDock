import cron from 'node-cron';
import { env, isSupabaseConfigured } from '../config/env.js';
import { broadcastUpdate } from '../lib/realtime.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendBookingReminderEmail } from '../services/email.js';

/**
 * Job 1: Every minute — Auto-release no-show bookings (not checked in within settings.no_show_min)
 * and mark finished checked-in bookings as completed. Idempotent.
 */
export async function runNoShowAndCompletionJob(): Promise<{
  releasedNoShows: number;
  completedBookings: number;
}> {
  if (!isSupabaseConfigured()) return { releasedNoShows: 0, completedBookings: 0 };
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const { data: settings } = await supabase
    .from('settings')
    .select('no_show_min')
    .eq('id', 1)
    .maybeSingle();
  const noShowMin = settings?.no_show_min ?? 15;
  const cutoffIso = new Date(now.getTime() - noShowMin * 60_000).toISOString();

  const { data: noShows } = await supabase
    .from('bookings')
    .update({ status: 'no_show' })
    .eq('status', 'booked')
    .is('checked_in_at', null)
    .lt('start_at', cutoffIso)
    .select('id');

  const { data: completed } = await supabase
    .from('bookings')
    .update({ status: 'completed', checked_out_at: now.toISOString() })
    .eq('status', 'checked_in')
    .lt('end_at', now.toISOString())
    .select('id');

  const releasedNoShows = noShows?.length ?? 0;
  const completedBookings = completed?.length ?? 0;
  if (releasedNoShows > 0 || completedBookings > 0) {
    broadcastUpdate(['bookings', 'seats']);
    console.info(
      `[cron:no-show] Released ${releasedNoShows} no-shows, completed ${completedBookings} finished sessions.`,
    );
  }
  return { releasedNoShows, completedBookings };
}

/**
 * Job 2: Every 5 minutes — Send reminder emails for bookings starting in the next 30 minutes
 * and expire unclaimed book pickup reservations past pickup_expires_at.
 */
export async function runRemindersAndBookExpiryJob(): Promise<{
  remindersSent: number;
  expiredPickups: number;
}> {
  if (!isSupabaseConfigured()) return { remindersSent: 0, expiredPickups: 0 };
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const in30MinIso = new Date(now.getTime() + 30 * 60_000).toISOString();

  const { data: upcoming } = await supabase
    .from('bookings')
    .select(
      'id, start_at, student:profiles!bookings_user_id_fkey(full_name, email), seat:seats(label, floor:floors(name))',
    )
    .eq('status', 'booked')
    .is('reminder_sent_at', null)
    .gte('start_at', now.toISOString())
    .lte('start_at', in30MinIso)
    .limit(50);

  let remindersSent = 0;
  for (const b of upcoming ?? []) {
    // Mark reminder_sent_at atomically first for idempotency
    const { data: claimed } = await supabase
      .from('bookings')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', b.id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle();

    if (!claimed) continue;

    const student = b.student as unknown as { full_name?: string; email?: string } | null;
    const seat = b.seat as unknown as { label?: string; floor?: { name?: string } } | null;
    if (student?.email) {
      await sendBookingReminderEmail({
        to: student.email,
        studentName: student.full_name || 'Student',
        seatLabel: seat?.label || 'Seat',
        floorName: seat?.floor?.name || 'Library',
        startAt: b.start_at,
      });
      remindersSent++;
    }
  }

  // Auto-cancel unclaimed book pickups past pickup_expires_at
  const { data: expiredIssues } = await supabase
    .from('book_issues')
    .update({ status: 'expired' })
    .eq('status', 'pending_pickup')
    .lt('pickup_expires_at', now.toISOString())
    .select('id, book_id');

  for (const issue of expiredIssues ?? []) {
    await supabase.from('books').update({ status: 'available' }).eq('id', issue.book_id);
  }

  const expiredPickups = expiredIssues?.length ?? 0;
  if (expiredPickups > 0) {
    broadcastUpdate(['books']);
  }
  if (remindersSent > 0 || expiredPickups > 0) {
    console.info(
      `[cron:reminders] Sent ${remindersSent} reminders, expired ${expiredPickups} unclaimed book pickups.`,
    );
  }
  return { remindersSent, expiredPickups };
}

/**
 * Job 3: Every 2 minutes — Record floor-wise occupancy snapshot for charts and analytics.
 */
export async function runOccupancySnapshotJob(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const [{ data: floors }, { data: seats }, { data: activeNow }] = await Promise.all([
    supabase.from('floors').select('id'),
    supabase.from('seats').select('id, floor_id, is_blocked'),
    supabase
      .from('bookings')
      .select('seat_id, status')
      .in('status', ['booked', 'checked_in'])
      .lte('start_at', nowIso)
      .gte('end_at', nowIso),
  ]);

  if (!floors || floors.length === 0) return 0;

  const activeBySeat = new Map<string, string>();
  for (const b of activeNow ?? []) activeBySeat.set(b.seat_id, b.status);

  const snapshots = floors.map((floor) => {
    const usable = (seats ?? []).filter((s) => s.floor_id === floor.id && !s.is_blocked);
    let occupiedCount = 0;
    let reservedCount = 0;
    for (const s of usable) {
      const st = activeBySeat.get(s.id);
      if (st === 'checked_in') occupiedCount++;
      else if (st === 'booked') reservedCount++;
    }
    return {
      floor_id: floor.id,
      taken_at: nowIso,
      occupied_count: occupiedCount,
      reserved_count: reservedCount,
      total_seats: usable.length,
    };
  });

  await supabase.from('occupancy_snapshots').insert(snapshots);
  return snapshots.length;
}

/**
 * Job 4: Daily at 00:00 — Reset demo bookings (if enabled) and clean up stale holds.
 */
export async function runDailyResetJob(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Expire any stale booked rows whose end_at has already passed
  await supabase
    .from('bookings')
    .update({ status: 'no_show' })
    .eq('status', 'booked')
    .lt('end_at', nowIso);

  if (env.enableDemoReset) {
    await supabase.from('bookings').delete().eq('is_demo', true);
    console.info('[cron:daily-reset] Cleared demo bookings for fresh daily cycle.');
  } else {
    console.info('[cron:daily-reset] Completed midnight maintenance sweep.');
  }
}

export function startScheduledJobs(): void {
  if (!isSupabaseConfigured()) {
    console.warn('[cron] Supabase env vars not configured — background jobs standing by.');
    return;
  }

  cron.schedule('* * * * *', () => {
    void runNoShowAndCompletionJob().catch((err) =>
      console.error('[cron:no-show] Error:', err),
    );
  });

  cron.schedule('*/5 * * * *', () => {
    void runRemindersAndBookExpiryJob().catch((err) =>
      console.error('[cron:reminders] Error:', err),
    );
  });

  cron.schedule('*/2 * * * *', () => {
    void runOccupancySnapshotJob().catch((err) =>
      console.error('[cron:occupancy] Error:', err),
    );
  });

  cron.schedule(
    '0 0 * * *',
    () => {
      void runDailyResetJob().catch((err) => console.error('[cron:daily-reset] Error:', err));
    },
    { timezone: env.timezone },
  );

  console.info(`[cron] Scheduled jobs initialized (timezone=${env.timezone}).`);
}
