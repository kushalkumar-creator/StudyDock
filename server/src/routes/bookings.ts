import { Router } from 'express';
import { z } from 'zod';
import { broadcastUpdate } from '../lib/realtime.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import {
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
  sendGroupInviteEmail,
} from '../services/email.js';
import {
  createSignedEntryToken,
  generateQrDataUrl,
  generateSixDigitCode,
  hashEntryCode,
} from '../services/signing.js';
import {
  buildGoogleCalendarUrl,
  generateIcsFile,
  validateBookingRules,
} from '../services/validation.js';
import type {
  AuthenticatedRequest,
  ExistingBookingSlot,
  HolidayRecord,
  LibrarySettings,
} from '../types/index.js';

export const bookingsRouter = Router();

bookingsRouter.use(verifySupabaseJWT);

const createBookingSchema = z.object({
  seatId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  groupName: z.string().trim().min(2).max(80).optional(),
  inviteEmails: z.array(z.string().email()).max(8).optional(),
});

const updateBookingSchema = z
  .object({
    seatId: z.string().uuid().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
  })
  .refine((v) => v.seatId || v.startAt || v.endAt, {
    message: 'Provide seatId, startAt, or endAt to update.',
  });

async function loadSettingsAndHolidays() {
  const supabase = getSupabaseAdmin();
  const [{ data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).single(),
    supabase.from('holidays').select('*'),
  ]);

  const effectiveSettings: LibrarySettings = (settings as LibrarySettings) ?? {
    id: 1,
    open_time: '08:00',
    close_time: '22:00',
    max_bookings_per_day: 2,
    max_hours_per_day: 8,
    early_entry_min: 15,
    no_show_min: 15,
    book_limit: 1,
    book_pickup_hours: 24,
    book_loan_days: 14,
    allowed_email_domain: '',
    timezone: 'Asia/Kolkata',
  };

  return {
    settings: effectiveSettings,
    holidays: (holidays ?? []) as HolidayRecord[],
  };
}

async function generateUniqueSixDigitCode(): Promise<{ code: string; hash: string }> {
  const supabase = getSupabaseAdmin();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateSixDigitCode();
    const hash = hashEntryCode(code);
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('entry_code_hash', hash)
      .in('status', ['booked', 'checked_in'])
      .limit(1);
    if (!existing || existing.length === 0) {
      return { code, hash };
    }
  }
  const fallback = generateSixDigitCode();
  return { code: fallback, hash: hashEntryCode(fallback) };
}

/**
 * GET /api/bookings/mine
 * Returns upcoming, current, previous bookings and group invites for the signed-in student.
 */
bookingsRouter.get('/mine', requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const now = Date.now();

    const [{ data: rows, error }, { data: invites }] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          `
          id, user_id, seat_id, start_at, end_at, status, used_at, checked_in_at, checked_out_at, group_id, created_at,
          seat:seats(id, label, section, table_no, seat_no, seat_type, floor:floors(id, name, level)),
          group:booking_groups(id, name, invites:group_invites(id, email, status))
        `,
        )
        .eq('user_id', req.user!.id)
        .order('start_at', { ascending: false })
        .limit(100),
      supabase
        .from('group_invites')
        .select(
          `
          id, email, status, invited_at, responded_at,
          group:booking_groups(
            id, name, owner:profiles(full_name, email),
            room:seats(label, section, floor:floors(name, level)),
            bookings(id, start_at, end_at, status)
          )
        `,
        )
        .ilike('email', req.user!.email)
        .order('invited_at', { ascending: false }),
    ]);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const upcoming: unknown[] = [];
    const current: unknown[] = [];
    const previous: unknown[] = [];

    const enrichedRows = await Promise.all(
      (rows ?? []).map(async (row) => {
        const endMs = Date.parse(row.end_at);
        const seat = row.seat as unknown as {
          id: string;
          label: string;
          section: string;
          floor?: { name: string };
        } | null;

        let entryPass: { signedToken: string; qrDataUrl: string; googleCalendarUrl: string } | null =
          null;

        if (row.status === 'booked' && !row.used_at && endMs > now) {
          const { token } = createSignedEntryToken({
            bookingId: row.id,
            seatId: row.seat_id,
            startISO: new Date(row.start_at).toISOString(),
            endISO: new Date(row.end_at).toISOString(),
          });
          const qrDataUrl = await generateQrDataUrl(token);
          const googleCalendarUrl = buildGoogleCalendarUrl({
            title: `Library Seat ${seat?.label ?? ''}`,
            details: 'Present your QR code at the library gate.',
            location: `${seat?.floor?.name ?? 'Library'} — ${seat?.section ?? ''}`,
            startAt: new Date(row.start_at),
            endAt: new Date(row.end_at),
          });
          entryPass = { signedToken: token, qrDataUrl, googleCalendarUrl };
        }

        return { ...row, entryPass };
      }),
    );

    for (const enriched of enrichedRows) {
      const startMs = Date.parse(enriched.start_at);
      const endMs = Date.parse(enriched.end_at);
      if (
        enriched.status === 'checked_in' ||
        (enriched.status === 'booked' && startMs <= now && endMs >= now)
      ) {
        current.push(enriched);
      } else if (enriched.status === 'booked' && startMs > now) {
        upcoming.push(enriched);
      } else {
        previous.push(enriched);
      }
    }

    res.json({
      upcoming: upcoming.reverse(),
      current,
      previous,
      groupInvites: invites ?? [],
    });
  } catch (err) {
    console.error('[bookings] GET /mine error:', err);
    res.status(500).json({ error: 'Failed to load reservations.' });
  }
});

/**
 * GET /api/bookings/:id/ics
 * Downloads a standard .ics calendar event for the booking.
 */
bookingsRouter.get('/:id/ics', async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, user_id, start_at, end_at, seat:seats(label, section, floor:floors(name))')
      .eq('id', req.params.id)
      .single();

    if (error || !booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (req.user!.role !== 'admin' && booking.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const seat = booking.seat as unknown as {
      label: string;
      section: string;
      floor?: { name: string };
    } | null;

    const ics = generateIcsFile({
      uid: booking.id,
      title: `Library Seat ${seat?.label ?? ''}`,
      description: 'StudyDock seat reservation. Show your QR or 6-digit code at the gate.',
      location: `${seat?.floor?.name ?? 'StudyDock Library'} — ${seat?.section ?? ''}, Seat ${seat?.label ?? ''}`,
      startAt: new Date(booking.start_at),
      endAt: new Date(booking.end_at),
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="library-seat-${seat?.label ?? booking.id}.ics"`);
    res.send(ics);
  } catch (err) {
    console.error('[bookings] GET /:id/ics error:', err);
    res.status(500).json({ error: 'Failed to generate calendar file.' });
  }
});

/**
 * POST /api/bookings
 * Validated, transactional seat (or group room) booking with signed QR & 6-digit code.
 */
bookingsRouter.post('/', requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid booking input.', details: parsed.error.flatten() });
      return;
    }

    const { seatId, startAt: startIsoRaw, endAt: endIsoRaw, groupName, inviteEmails } = parsed.data;
    const startAt = new Date(startIsoRaw);
    const endAt = new Date(endIsoRaw);
    const supabase = getSupabaseAdmin();

    // 1. Check seat exists & is not blocked
    const { data: seat, error: seatErr } = await supabase
      .from('seats')
      .select('*, floor:floors(id, name, level)')
      .eq('id', seatId)
      .single();

    if (seatErr || !seat) {
      res.status(404).json({ error: 'Selected seat does not exist.' });
      return;
    }
    if (seat.is_blocked) {
      res.status(409).json({
        error: `Seat ${seat.label} is temporarily unavailable${seat.block_reason ? `: ${seat.block_reason}` : '.'}`,
      });
      return;
    }

    // 2. Load rules, holidays, existing bookings for seat & user
    const [{ settings, holidays }, { data: seatBookings }, { data: userBookings }] = await Promise.all([
      loadSettingsAndHolidays(),
      supabase
        .from('bookings')
        .select('id, seat_id, user_id, start_at, end_at, status')
        .eq('seat_id', seatId)
        .in('status', ['booked', 'checked_in']),
      supabase
        .from('bookings')
        .select('id, seat_id, user_id, start_at, end_at, status')
        .eq('user_id', req.user!.id)
        .gte('end_at', new Date(Date.now() - 86_400_000).toISOString()),
    ]);

    const validation = validateBookingRules(
      { seatId, startAt, endAt },
      settings,
      holidays,
      (seatBookings ?? []) as ExistingBookingSlot[],
      (userBookings ?? []) as ExistingBookingSlot[],
    );

    if (!validation.ok) {
      const status =
        validation.code === 'SEAT_CONFLICT' || validation.code === 'USER_CONFLICT' ? 409 : 400;
      res.status(status).json({ error: validation.message, code: validation.code });
      return;
    }

    // 3. Optional group creation for discussion rooms
    let groupId: string | null = null;
    if (groupName || (inviteEmails && inviteEmails.length > 0)) {
      const { data: group, error: gErr } = await supabase
        .from('booking_groups')
        .insert({
          owner_id: req.user!.id,
          name: groupName || `${req.user!.full_name}'s Study Group`,
          room_id: seatId,
        })
        .select('id')
        .single();

      if (gErr || !group) {
        res.status(500).json({ error: 'Failed to create study group.' });
        return;
      }
      groupId = group.id;

      const uniqueInvites = Array.from(
        new Set(
          (inviteEmails ?? [])
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e && e !== req.user!.email.toLowerCase()),
        ),
      );
      if (uniqueInvites.length > 0) {
        await supabase.from('group_invites').insert(
          uniqueInvites.map((email) => ({
            group_id: group.id,
            email,
            status: 'pending',
          })),
        );
      }
    }

    // 4. Generate 6-digit code + pre-generate UUID so HMAC token binds to bookingId
    const bookingId = crypto.randomUUID();
    const { code: sixDigitCode, hash: entryCodeHash } = await generateUniqueSixDigitCode();
    const startISO = startAt.toISOString();
    const endISO = endAt.toISOString();
    const { token: signedToken, signature } = createSignedEntryToken({
      bookingId,
      seatId,
      startISO,
      endISO,
    });

    const { data: inserted, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        user_id: req.user!.id,
        seat_id: seatId,
        start_at: startISO,
        end_at: endISO,
        status: 'booked',
        entry_code_hash: entryCodeHash,
        token_sig: signature,
        group_id: groupId,
      })
      .select('*, seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))')
      .single();

    if (insertErr) {
      // 23P01 = Postgres exclusion constraint violation (concurrent double-booking race)
      if (insertErr.code === '23P01') {
        res.status(409).json({
          error: 'Seat or time slot was just claimed by another reservation. Please pick another.',
          code: 'SEAT_CONFLICT',
        });
        return;
      }
      res.status(500).json({ error: insertErr.message });
      return;
    }

    const qrDataUrl = await generateQrDataUrl(signedToken);
    const floorName = (seat.floor as unknown as { name?: string })?.name ?? 'Library';
    const googleCalendarUrl = buildGoogleCalendarUrl({
      title: `Library Seat ${seat.label} (${floorName})`,
      details: `6-digit entry code: ${sixDigitCode}`,
      location: `${floorName} — ${seat.section}, Seat ${seat.label}`,
      startAt,
      endAt,
    });

    // Send confirmation & group invite emails asynchronously (non-blocking)
    void sendBookingConfirmationEmail({
      to: req.user!.email,
      studentName: req.user!.full_name || 'Student',
      seatLabel: seat.label,
      floorName,
      section: seat.section,
      startAt: startISO,
      endAt: endISO,
      sixDigitCode,
      signedToken,
    });

    if (groupId && inviteEmails && inviteEmails.length > 0) {
      for (const email of inviteEmails) {
        if (email.toLowerCase() !== req.user!.email.toLowerCase()) {
          void sendGroupInviteEmail({
            to: email,
            inviterName: req.user!.full_name || req.user!.email,
            groupName: groupName || 'Study Session',
            seatLabel: seat.label,
            startAt: startISO,
          });
        }
      }
    }

    broadcastUpdate(['bookings', 'seats']);
    res.status(201).json({
      booking: inserted,
      entryPass: {
        sixDigitCode,
        signedToken,
        qrDataUrl,
        googleCalendarUrl,
      },
    });
  } catch (err) {
    console.error('[bookings] POST / error:', err);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

/**
 * PATCH /api/bookings/:id
 * Extend or move an existing active booking (re-validated against all rules).
 */
bookingsRouter.patch('/:id', requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update payload.', details: parsed.error.flatten() });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: findErr } = await supabase
      .from('bookings')
      .select('*, seat:seats(id, label, section, floor:floors(id, name, level))')
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id)
      .single();

    if (findErr || !existing) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (!['booked', 'checked_in'].includes(existing.status)) {
      res.status(400).json({ error: `Cannot modify a ${existing.status} booking.` });
      return;
    }

    const nextSeatId = parsed.data.seatId ?? existing.seat_id;
    const nextStart = new Date(parsed.data.startAt ?? existing.start_at);
    const nextEnd = new Date(parsed.data.endAt ?? existing.end_at);

    // Checked-in bookings can only extend end_at (not move start_at or seat after entry)
    if (existing.status === 'checked_in' && parsed.data.seatId && parsed.data.seatId !== existing.seat_id) {
      res.status(400).json({ error: 'Checked-in bookings cannot change seats; you may extend duration.' });
      return;
    }

    const { data: targetSeat } = await supabase
      .from('seats')
      .select('*, floor:floors(id, name, level)')
      .eq('id', nextSeatId)
      .single();

    if (!targetSeat || targetSeat.is_blocked) {
      res.status(409).json({ error: 'Target seat is unavailable or blocked.' });
      return;
    }

    const [{ settings, holidays }, { data: seatBookings }, { data: userBookings }] = await Promise.all([
      loadSettingsAndHolidays(),
      supabase
        .from('bookings')
        .select('id, seat_id, user_id, start_at, end_at, status')
        .eq('seat_id', nextSeatId)
        .in('status', ['booked', 'checked_in']),
      supabase
        .from('bookings')
        .select('id, seat_id, user_id, start_at, end_at, status')
        .eq('user_id', req.user!.id)
        .gte('end_at', new Date(Date.now() - 86_400_000).toISOString()),
    ]);

    // If extending an already checked-in booking, allow startAt in the past
    const referenceNow = existing.status === 'checked_in' ? nextStart : new Date();

    const validation = validateBookingRules(
      {
        seatId: nextSeatId,
        startAt: nextStart,
        endAt: nextEnd,
        excludeBookingId: existing.id,
      },
      settings,
      holidays,
      (seatBookings ?? []) as ExistingBookingSlot[],
      (userBookings ?? []) as ExistingBookingSlot[],
      referenceNow,
    );

    if (!validation.ok) {
      res.status(400).json({ error: validation.message, code: validation.code });
      return;
    }

    const startISO = nextStart.toISOString();
    const endISO = nextEnd.toISOString();
    const { token: signedToken, signature } = createSignedEntryToken({
      bookingId: existing.id,
      seatId: nextSeatId,
      startISO,
      endISO,
    });

    const updateFields: Record<string, unknown> = {
      seat_id: nextSeatId,
      start_at: startISO,
      end_at: endISO,
      token_sig: signature,
    };

    let newSixDigitCode: string | null = null;
    if (existing.status === 'booked') {
      const regenerated = await generateUniqueSixDigitCode();
      newSixDigitCode = regenerated.code;
      updateFields.entry_code_hash = regenerated.hash;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update(updateFields)
      .eq('id', existing.id)
      .select('*, seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))')
      .single();

    if (updateErr) {
      if (updateErr.code === '23P01') {
        res.status(409).json({ error: 'Selected seat or time slot is already taken.' });
        return;
      }
      res.status(500).json({ error: updateErr.message });
      return;
    }

    const qrDataUrl = await generateQrDataUrl(signedToken);
    const floorName = (targetSeat.floor as unknown as { name?: string })?.name ?? 'Library';

    if (newSixDigitCode) {
      void sendBookingConfirmationEmail({
        to: req.user!.email,
        studentName: req.user!.full_name || 'Student',
        seatLabel: targetSeat.label,
        floorName,
        section: targetSeat.section,
        startAt: startISO,
        endAt: endISO,
        sixDigitCode: newSixDigitCode,
        signedToken,
      });
    }

    broadcastUpdate(['bookings', 'seats']);
    res.json({
      booking: updated,
      entryPass: newSixDigitCode
        ? {
            sixDigitCode: newSixDigitCode,
            signedToken,
            qrDataUrl,
            googleCalendarUrl: buildGoogleCalendarUrl({
              title: `Library Seat ${targetSeat.label}`,
              details: `Updated 6-digit entry code: ${newSixDigitCode}`,
              location: `${floorName} — ${targetSeat.section}`,
              startAt: nextStart,
              endAt: nextEnd,
            }),
          }
        : null,
    });
  } catch (err) {
    console.error('[bookings] PATCH /:id error:', err);
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

/**
 * DELETE /api/bookings/:id
 * Cancels the student's active reservation (immediately invalidating its entry code).
 */
bookingsRouter.delete('/:id', requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: findErr } = await supabase
      .from('bookings')
      .select('id, status, start_at, seat:seats(label)')
      .eq('id', req.params.id)
      .eq('user_id', req.user!.id)
      .single();

    if (findErr || !existing) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    if (existing.status !== 'booked') {
      res.status(400).json({ error: 'Only upcoming (not yet checked-in) bookings can be cancelled.' });
      return;
    }

    const { error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', existing.id);

    if (updErr) {
      res.status(500).json({ error: updErr.message });
      return;
    }

    const seatLabel = (existing.seat as unknown as { label?: string })?.label ?? 'Seat';
    void sendBookingCancellationEmail({
      to: req.user!.email,
      studentName: req.user!.full_name || 'Student',
      seatLabel,
      startAt: existing.start_at,
    });

    broadcastUpdate(['bookings', 'seats']);
    res.json({ cancelled: true, id: existing.id });
  } catch (err) {
    console.error('[bookings] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to cancel booking.' });
  }
});

/**
 * POST /api/bookings/invites/:inviteId/respond
 * Accept or decline a group room invite.
 */
bookingsRouter.post(
  '/invites/:inviteId/respond',
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({ status: z.enum(['accepted', 'declined']) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Status must be accepted or declined.' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('group_invites')
        .update({
          status: parsed.data.status,
          responded_at: new Date().toISOString(),
        })
        .eq('id', req.params.inviteId)
        .ilike('email', req.user!.email)
        .select('*')
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'Invitation not found.' });
        return;
      }

      res.json({ invite: data });
    } catch (err) {
      console.error('[bookings] POST invite respond error:', err);
      res.status(500).json({ error: 'Failed to respond to invitation.' });
    }
  },
);
