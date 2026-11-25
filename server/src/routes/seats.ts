import { Router } from 'express';
import { serverCache } from '../lib/cache.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { requireRole, verifySupabaseJWT } from '../middleware/auth.js';
import type { AuthenticatedRequest, SeatLiveStatus } from '../types/index.js';

export const seatsRouter = Router();

seatsRouter.use(verifySupabaseJWT);

/**
 * GET /api/seats?floor=&date=&from=&to=
 * Returns floors and seats with computed live status: available | reserved | occupied | blocked.
 */
seatsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { floor, from, to } = req.query as {
      floor?: string;
      date?: string;
      from?: string;
      to?: string;
    };

    const now = new Date();
    const windowStart = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : now;
    const windowEnd =
      to && !Number.isNaN(Date.parse(to))
        ? new Date(to)
        : new Date(windowStart.getTime() + 60 * 60_000);

    const windowKey = `seats:${req.user!.id}:${floor || 'all'}:${windowStart.toISOString()}:${windowEnd.toISOString()}`;
    const payload = await serverCache.getOrSet(windowKey, 15_000, async () => {
      // Run layout (cached 60s), active window bookings, and user favourites in a SINGLE parallel wave
      const [layout, bookingsRes, favsRes] = await Promise.all([
        serverCache.getOrSet('layout:floors_seats', 60_000, async () => {
          const [{ data: floorsData, error: floorsErr }, { data: seatsData, error: seatsErr }] =
            await Promise.all([
              supabase.from('floors').select('*').order('level', { ascending: true }),
              supabase.from('seats').select('*').order('label', { ascending: true }),
            ]);
          if (floorsErr) throw new Error(floorsErr.message);
          if (seatsErr) throw new Error(seatsErr.message);
          return { floors: floorsData ?? [], seats: seatsData ?? [] };
        }),
        supabase
          .from('bookings')
          .select('id, seat_id, user_id, start_at, end_at, status')
          .in('status', ['booked', 'checked_in'])
          .lt('start_at', windowEnd.toISOString())
          .gt('end_at', windowStart.toISOString()),
        supabase.from('favourite_seats').select('seat_id').eq('user_id', req.user!.id),
      ]);

      if (bookingsRes.error) {
        throw new Error(bookingsRes.error.message);
      }

      const { floors, seats } = layout;
      const overlappingBookings = bookingsRes.data ?? [];
      const favs = favsRes.data ?? [];

      let filteredSeats = seats;
      if (floor && floor !== 'all') {
        const matchedFloor = floors.find(
          (f) => f.id === floor || String(f.level) === String(floor),
        );
        if (matchedFloor) {
          filteredSeats = filteredSeats.filter((s) => s.floor_id === matchedFloor.id);
        }
      }

      const favSet = new Set(favs.map((f) => f.seat_id));

      const bookingsBySeat = new Map<string, typeof overlappingBookings>();
      for (const b of overlappingBookings) {
        const list = bookingsBySeat.get(b.seat_id) ?? [];
        list.push(b);
        bookingsBySeat.set(b.seat_id, list);
      }

      const enrichedSeats = filteredSeats.map((seat) => {
        let status: SeatLiveStatus = 'available';
        const seatBookings = bookingsBySeat.get(seat.id) ?? [];
        if (seat.is_blocked) {
          status = 'blocked';
        } else if (seatBookings.some((b) => b.status === 'checked_in')) {
          status = 'occupied';
        } else if (seatBookings.length > 0) {
          status = 'reserved';
        }

        return {
          ...seat,
          status,
          is_favourite: favSet.has(seat.id),
          active_booking: seatBookings[0]
            ? {
                start_at: seatBookings[0].start_at,
                end_at: seatBookings[0].end_at,
                status: seatBookings[0].status,
                is_mine: seatBookings[0].user_id === req.user!.id,
              }
            : null,
        };
      });

      const summary = {
        total: enrichedSeats.length,
        available: enrichedSeats.filter((s) => s.status === 'available').length,
        reserved: enrichedSeats.filter((s) => s.status === 'reserved').length,
        occupied: enrichedSeats.filter((s) => s.status === 'occupied').length,
        blocked: enrichedSeats.filter((s) => s.status === 'blocked').length,
      };

      return {
        floors,
        seats: enrichedSeats,
        summary,
        window: {
          from: windowStart.toISOString(),
          to: windowEnd.toISOString(),
        },
      };
    });

    res.json(payload);
  } catch (err) {
    console.error('[seats] GET / error:', err);
    res.status(500).json({ error: 'Failed to load seat map.' });
  }
});

seatsRouter.get('/favourites', requireRole('student'), async (req: AuthenticatedRequest, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('favourite_seats')
      .select('created_at, seat:seats(*, floor:floors(id, name, level))')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ favourites: data ?? [] });
  } catch (err) {
    console.error('[seats] GET /favourites error:', err);
    res.status(500).json({ error: 'Failed to load favourite seats.' });
  }
});

seatsRouter.post(
  '/:seatId/favourite',
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { seatId } = req.params;
      const { error } = await supabase
        .from('favourite_seats')
        .upsert({ user_id: req.user!.id, seat_id: seatId }, { onConflict: 'user_id,seat_id' });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      serverCache.invalidate(`seats:${req.user!.id}:`);
      res.status(201).json({ seat_id: seatId, favourite: true });
    } catch (err) {
      console.error('[seats] POST favourite error:', err);
      res.status(500).json({ error: 'Failed to save favourite seat.' });
    }
  },
);

seatsRouter.delete(
  '/:seatId/favourite',
  requireRole('student'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { seatId } = req.params;
      const { error } = await supabase
        .from('favourite_seats')
        .delete()
        .eq('user_id', req.user!.id)
        .eq('seat_id', seatId);

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }
      serverCache.invalidate(`seats:${req.user!.id}:`);
      res.json({ seat_id: seatId, favourite: false });
    } catch (err) {
      console.error('[seats] DELETE favourite error:', err);
      res.status(500).json({ error: 'Failed to remove favourite seat.' });
    }
  },
);
