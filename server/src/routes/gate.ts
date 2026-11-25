import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { broadcastUpdate } from '../lib/realtime.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import {
  evaluateEntryWindow,
  hashEntryCode,
  verifySignedEntryToken,
} from '../services/signing.js';
import type { AuthenticatedRequest, GateVerifyResult } from '../types/index.js';

export const gateRouter = Router();

const gateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many gate verification attempts. Please wait a moment.' },
});

const verifySchema = z
  .object({
    token: z.string().min(10).optional(),
    code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits').optional(),
  })
  .refine((v) => Boolean(v.token) !== Boolean(v.code), {
    message: 'Provide either a QR token or a 6-digit code.',
  });

gateRouter.post(
  '/verify',
  gateRateLimiter,
  verifySupabaseJWT,
  requireRole('admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          result: 'INVALID' as GateVerifyResult,
          message: 'Provide either a valid QR token or a 6-digit entry code.',
        });
        return;
      }

      const supabase = getSupabaseAdmin();
      const { token, code } = parsed.data;
      const method = token ? 'qr' : 'code';

      const logAttempt = async (bookingId: string | null, result: GateVerifyResult) => {
        await supabase.from('gate_logs').insert({
          booking_id: bookingId,
          verified_by: req.user!.id,
          method,
          result,
        });
      };

      const { data: settingsRow } = await supabase
        .from('settings')
        .select('early_entry_min')
        .eq('id', 1)
        .single();
      const earlyEntryMin = settingsRow?.early_entry_min ?? 15;

      let booking: Record<string, unknown> | null = null;

      if (token) {
        const verified = verifySignedEntryToken(token);
        if (!verified.valid) {
          await logAttempt(null, 'INVALID');
          res.status(200).json({
            result: 'INVALID' as GateVerifyResult,
            message: 'Forged or corrupted QR signature.',
          });
          return;
        }

        const { data } = await supabase
          .from('bookings')
          .select(
            `
            id, user_id, seat_id, start_at, end_at, status, token_sig, used_at, checked_in_at,
            student:profiles!bookings_user_id_fkey(id, full_name, email),
            seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))
          `,
          )
          .eq('id', verified.bookingId)
          .single();

        if (!data || data.seat_id !== verified.seatId || data.token_sig !== verified.signature) {
          await logAttempt(data?.id ?? null, 'INVALID');
          res.status(200).json({
            result: 'INVALID' as GateVerifyResult,
            message: 'QR token does not match an active booking record.',
          });
          return;
        }
        booking = data as unknown as Record<string, unknown>;
      } else if (code) {
        const hashed = hashEntryCode(code);
        const { data } = await supabase
          .from('bookings')
          .select(
            `
            id, user_id, seat_id, start_at, end_at, status, token_sig, used_at, checked_in_at,
            student:profiles!bookings_user_id_fkey(id, full_name, email),
            seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))
          `,
          )
          .eq('entry_code_hash', hashed)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!data) {
          await logAttempt(null, 'INVALID');
          res.status(200).json({
            result: 'INVALID' as GateVerifyResult,
            message: 'No booking found for this 6-digit code.',
          });
          return;
        }
        booking = data as unknown as Record<string, unknown>;
      }

      if (!booking) {
        await logAttempt(null, 'INVALID');
        res.status(200).json({
          result: 'INVALID' as GateVerifyResult,
          message: 'Unknown entry credential.',
        });
        return;
      }

      const bookingId = String(booking.id);
      const status = String(booking.status);

      // Cancelled, no-show, completed, or already used codes are strictly INVALID
      if (status === 'cancelled') {
        await logAttempt(bookingId, 'INVALID');
        res.status(200).json({
          result: 'INVALID' as GateVerifyResult,
          message: 'This reservation was cancelled.',
          booking,
        });
        return;
      }

      if (booking.used_at || status === 'checked_in') {
        await logAttempt(bookingId, 'INVALID');
        res.status(200).json({
          result: 'INVALID' as GateVerifyResult,
          message: 'Entry code has already been used (single-use).',
          booking,
        });
        return;
      }

      if (status === 'no_show' || status === 'completed') {
        await logAttempt(bookingId, 'EXPIRED');
        res.status(200).json({
          result: 'EXPIRED' as GateVerifyResult,
          message:
            status === 'no_show'
              ? 'Booking was automatically released as a no-show.'
              : 'Booking has already ended.',
          booking,
        });
        return;
      }

      const now = new Date();
      const windowEval = evaluateEntryWindow(
        new Date(String(booking.start_at)),
        new Date(String(booking.end_at)),
        now,
        earlyEntryMin,
      );

      if (windowEval === 'TOO EARLY') {
        await logAttempt(bookingId, 'TOO EARLY');
        res.status(200).json({
          result: 'TOO EARLY' as GateVerifyResult,
          message: `Entry opens ${earlyEntryMin} minutes before the booking start time.`,
          booking,
        });
        return;
      }

      if (windowEval === 'EXPIRED') {
        await logAttempt(bookingId, 'EXPIRED');
        res.status(200).json({
          result: 'EXPIRED' as GateVerifyResult,
          message: 'This booking window has already expired.',
          booking,
        });
        return;
      }

      // Atomic single-use check-in update: WHERE id = ? AND used_at IS NULL AND status = 'booked'
      const nowIso = now.toISOString();
      const { data: updated, error: updErr } = await supabase
        .from('bookings')
        .update({
          used_at: nowIso,
          checked_in_at: nowIso,
          status: 'checked_in',
        })
        .eq('id', bookingId)
        .is('used_at', null)
        .eq('status', 'booked')
        .select(
          `
          id, user_id, seat_id, start_at, end_at, status, used_at, checked_in_at,
          student:profiles!bookings_user_id_fkey(id, full_name, email),
          seat:seats(id, label, section, table_no, seat_no, floor:floors(id, name, level))
        `,
        )
        .maybeSingle();

      if (updErr || !updated) {
        await logAttempt(bookingId, 'INVALID');
        res.status(200).json({
          result: 'INVALID' as GateVerifyResult,
          message: 'Entry code was already redeemed in a concurrent scan.',
        });
        return;
      }

      await logAttempt(bookingId, 'VALID');
      broadcastUpdate(['bookings', 'seats']);
      res.status(200).json({
        result: 'VALID' as GateVerifyResult,
        message: 'Check-in confirmed! Welcome to StudyDock.',
        booking: updated,
      });
    } catch (err) {
      console.error('[gate] POST /verify error:', err);
      res.status(500).json({ error: 'Gate verification failed.' });
    }
  },
);
