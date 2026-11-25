import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { setSupabaseAdminForTests } from '../src/lib/supabase.js';
import { createSignedEntryToken, hashEntryCode } from '../src/services/signing.js';

interface MockBookingRecord {
  id: string;
  user_id: string;
  seat_id: string;
  start_at: string;
  end_at: string;
  status: string;
  entry_code_hash: string;
  token_sig: string;
  used_at: string | null;
  checked_in_at: string | null;
}

function createMockSupabase(state: { bookings: MockBookingRecord[] }): SupabaseClient {
  const profiles: Record<string, { id: string; full_name: string; email: string; role: string }> = {
    'student-1': {
      id: 'student-1',
      full_name: 'Aarav Sharma',
      email: 'aarav@college.edu',
      role: 'student',
    },
    'admin-1': {
      id: 'admin-1',
      full_name: 'Dr. Meera Nair',
      email: 'admin@college.edu',
      role: 'admin',
    },
  };

  const mock = {
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'student-token') {
          return { data: { user: { id: 'student-1', email: 'aarav@college.edu' } }, error: null };
        }
        if (token === 'admin-token') {
          return { data: { user: { id: 'admin-1', email: 'admin@college.edu' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: vi.fn((table: string) => {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      let updatePayload: Record<string, unknown> | null = null;
      let isInsert = false;

      const execSelect = () => {
        if (table === 'profiles') {
          const idFilter = filters.find((f) => f.col === 'id');
          const row = idFilter ? profiles[String(idFilter.val)] : null;
          return { data: row ? [row] : [], error: null };
        }
        if (table === 'settings') {
          return { data: [{ id: 1, early_entry_min: 15 }], error: null };
        }
        if (table === 'bookings') {
          const rows = state.bookings.filter((b) =>
            filters.every((f) => {
              const v = (b as unknown as Record<string, unknown>)[f.col];
              if (f.op === 'eq') return v === f.val;
              if (f.op === 'is') return v === f.val;
              return true;
            }),
          );
          if (updatePayload) {
            for (const r of rows) {
              Object.assign(r, updatePayload);
            }
          }
          return { data: rows, error: null };
        }
        return { data: [], error: null };
      };

      const chain = {
        select: () => chain,
        insert: () => {
          isInsert = true;
          return Promise.resolve({ data: null, error: null });
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push({ col, op: 'eq', val });
          return chain;
        },
        is: (col: string, val: unknown) => {
          filters.push({ col, op: 'is', val });
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        single: async () => {
          if (isInsert) return { data: null, error: null };
          const res = execSelect();
          return { data: res.data[0] ?? null, error: res.data[0] ? null : { message: 'Not found' } };
        },
        maybeSingle: async () => {
          const res = execSelect();
          return { data: res.data[0] ?? null, error: null };
        },
      };
      return chain;
    }),
  };

  return mock as unknown as SupabaseClient;
}

describe('API Role Guards & Gate Verification', () => {
  const originalUrl = env.supabaseUrl;
  const originalKey = env.supabaseServiceRoleKey;

  beforeEach(() => {
    env.supabaseUrl = 'https://mock.supabase.co';
    env.supabaseServiceRoleKey = 'mock-service-role-key';
  });

  afterEach(() => {
    setSupabaseAdminForTests(null);
    env.supabaseUrl = originalUrl;
    env.supabaseServiceRoleKey = originalKey;
  });

  it('responds 200 on /api/health', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('blocks unauthenticated and student users from admin & gate endpoints', async () => {
    setSupabaseAdminForTests(createMockSupabase({ bookings: [] }));
    const app = createApp();

    const noAuth = await request(app).post('/api/gate/verify').send({ code: '123456' });
    expect(noAuth.status).toBe(401);

    const studentGate = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer student-token')
      .send({ code: '123456' });
    expect(studentGate.status).toBe(403);

    const studentAdmin = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer student-token');
    expect(studentAdmin.status).toBe(403);
  });

  it('verifies a valid QR token once and rejects reuse (single-use atomic check)', async () => {
    const now = Date.now();
    const bookingId = '11111111-1111-4111-8111-111111111111';
    const seatId = '22222222-2222-4222-8222-222222222222';
    const startISO = new Date(now - 5 * 60_000).toISOString();
    const endISO = new Date(now + 55 * 60_000).toISOString();
    const { token, signature } = createSignedEntryToken({ bookingId, seatId, startISO, endISO });

    const state = {
      bookings: [
        {
          id: bookingId,
          user_id: 'student-1',
          seat_id: seatId,
          start_at: startISO,
          end_at: endISO,
          status: 'booked',
          entry_code_hash: hashEntryCode('654321'),
          token_sig: signature,
          used_at: null,
          checked_in_at: null,
        },
      ],
    };

    setSupabaseAdminForTests(createMockSupabase(state));
    const app = createApp();

    // First scan -> VALID
    const first = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token });
    expect(first.status).toBe(200);
    expect(first.body.result).toBe('VALID');
    expect(state.bookings[0].status).toBe('checked_in');
    expect(state.bookings[0].used_at).not.toBeNull();

    // Second scan with same token OR 6-digit code -> INVALID (single-use!)
    const secondQr = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token });
    expect(secondQr.body.result).toBe('INVALID');

    const secondCode = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ code: '654321' });
    expect(secondCode.body.result).toBe('INVALID');
  });

  it('returns INVALID for forged token and cancelled booking, TOO EARLY and EXPIRED for out-of-window bookings', async () => {
    const now = Date.now();
    const cancelledId = '33333333-3333-4333-8333-333333333333';
    const earlyId = '44444444-4444-4444-8444-444444444444';
    const expiredId = '55555555-5555-4555-8555-555555555555';
    const seatId = '22222222-2222-4222-8222-222222222222';

    const cancelledTok = createSignedEntryToken({
      bookingId: cancelledId,
      seatId,
      startISO: new Date(now).toISOString(),
      endISO: new Date(now + 3600_000).toISOString(),
    });
    const earlyTok = createSignedEntryToken({
      bookingId: earlyId,
      seatId,
      startISO: new Date(now + 45 * 60_000).toISOString(),
      endISO: new Date(now + 105 * 60_000).toISOString(),
    });
    const expiredTok = createSignedEntryToken({
      bookingId: expiredId,
      seatId,
      startISO: new Date(now - 120 * 60_000).toISOString(),
      endISO: new Date(now - 10 * 60_000).toISOString(),
    });

    setSupabaseAdminForTests(
      createMockSupabase({
        bookings: [
          {
            id: cancelledId,
            user_id: 'student-1',
            seat_id: seatId,
            start_at: new Date(now).toISOString(),
            end_at: new Date(now + 3600_000).toISOString(),
            status: 'cancelled',
            entry_code_hash: hashEntryCode('111111'),
            token_sig: cancelledTok.signature,
            used_at: null,
            checked_in_at: null,
          },
          {
            id: earlyId,
            user_id: 'student-1',
            seat_id: seatId,
            start_at: new Date(now + 45 * 60_000).toISOString(),
            end_at: new Date(now + 105 * 60_000).toISOString(),
            status: 'booked',
            entry_code_hash: hashEntryCode('222222'),
            token_sig: earlyTok.signature,
            used_at: null,
            checked_in_at: null,
          },
          {
            id: expiredId,
            user_id: 'student-1',
            seat_id: seatId,
            start_at: new Date(now - 120 * 60_000).toISOString(),
            end_at: new Date(now - 10 * 60_000).toISOString(),
            status: 'booked',
            entry_code_hash: hashEntryCode('333333'),
            token_sig: expiredTok.signature,
            used_at: null,
            checked_in_at: null,
          },
        ],
      }),
    );

    const app = createApp();

    const forgedRes = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token: 'Zm9yZ2Vk.0000000000000000000000000000000000000000000000000000000000000000' });
    expect(forgedRes.body.result).toBe('INVALID');

    const cancelledRes = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token: cancelledTok.token });
    expect(cancelledRes.body.result).toBe('INVALID');

    const earlyRes = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token: earlyTok.token });
    expect(earlyRes.body.result).toBe('TOO EARLY');

    const expiredRes = await request(app)
      .post('/api/gate/verify')
      .set('Authorization', 'Bearer admin-token')
      .send({ token: expiredTok.token });
    expect(expiredRes.body.result).toBe('EXPIRED');
  });
});
