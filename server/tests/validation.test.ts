import { describe, expect, it } from 'vitest';
import { validateBookingRules } from '../src/services/validation.js';
import type { ExistingBookingSlot, HolidayRecord, LibrarySettings } from '../src/types/index.js';

const baseSettings: LibrarySettings = {
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
  timezone: 'UTC',
};

const holidays: HolidayRecord[] = [{ id: 'h1', date: '2026-11-28', label: 'Founder Day' }];

const now = new Date('2026-11-25T09:00:00.000Z');

describe('Booking Validation Rules', () => {
  it('accepts a valid 2-hour booking within library hours', () => {
    const res = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T10:00:00.000Z'),
        endAt: new Date('2026-11-25T12:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(res.ok).toBe(true);
  });

  it('rejects past time slots', () => {
    const res = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T08:00:00.000Z'),
        endAt: new Date('2026-11-25T09:30:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('PAST_TIME');
  });

  it('rejects bookings more than 7 days in advance', () => {
    const res = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-12-04T10:00:00.000Z'),
        endAt: new Date('2026-12-04T12:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('ADVANCE_LIMIT');
  });

  it('rejects invalid duration (< 30 min, > 8 h, or non-30-min step)', () => {
    const tooShort = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T10:00:00.000Z'),
        endAt: new Date('2026-11-25T10:15:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(tooShort.code).toBe('DURATION_INVALID');

    const tooLong = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T10:00:00.000Z'),
        endAt: new Date('2026-11-25T19:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(tooLong.code).toBe('DURATION_INVALID');
  });

  it('rejects bookings on holidays and outside library hours', () => {
    const onHoliday = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-28T10:00:00.000Z'),
        endAt: new Date('2026-11-28T12:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(onHoliday.code).toBe('HOLIDAY');

    const pastClose = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T21:00:00.000Z'),
        endAt: new Date('2026-11-25T22:30:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [],
      now,
    );
    expect(pastClose.code).toBe('OUTSIDE_HOURS');
  });

  it('blocks double-booking on the same seat and overlapping bookings for the same student', () => {
    const existingSeat: ExistingBookingSlot[] = [
      {
        id: 'b1',
        seat_id: 'seat-1',
        user_id: 'other-user',
        start_at: '2026-11-25T10:30:00.000Z',
        end_at: '2026-11-25T12:30:00.000Z',
        status: 'booked',
      },
    ];

    const seatConflict = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T10:00:00.000Z'),
        endAt: new Date('2026-11-25T11:00:00.000Z'),
      },
      baseSettings,
      holidays,
      existingSeat,
      [],
      now,
    );
    expect(seatConflict.code).toBe('SEAT_CONFLICT');

    const userConflict = validateBookingRules(
      {
        seatId: 'seat-2',
        startAt: new Date('2026-11-25T11:00:00.000Z'),
        endAt: new Date('2026-11-25T13:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [{ ...existingSeat[0], user_id: 'me' }],
      now,
    );
    expect(userConflict.code).toBe('USER_CONFLICT');
  });

  it('enforces daily max bookings and daily max hours per student', () => {
    const twoToday: ExistingBookingSlot[] = [
      {
        id: 'b1',
        seat_id: 'seat-1',
        user_id: 'me',
        start_at: '2026-11-25T09:30:00.000Z',
        end_at: '2026-11-25T10:30:00.000Z',
        status: 'booked',
      },
      {
        id: 'b2',
        seat_id: 'seat-1',
        user_id: 'me',
        start_at: '2026-11-25T11:00:00.000Z',
        end_at: '2026-11-25T12:00:00.000Z',
        status: 'booked',
      },
    ];

    const limitHit = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T14:00:00.000Z'),
        endAt: new Date('2026-11-25T15:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      twoToday,
      now,
    );
    expect(limitHit.code).toBe('DAILY_BOOKING_LIMIT');

    const hoursHit = validateBookingRules(
      {
        seatId: 'seat-1',
        startAt: new Date('2026-11-25T16:00:00.000Z'),
        endAt: new Date('2026-11-25T19:00:00.000Z'),
      },
      baseSettings,
      holidays,
      [],
      [
        {
          id: 'b3',
          seat_id: 'seat-2',
          user_id: 'me',
          start_at: '2026-11-25T09:00:00.000Z',
          end_at: '2026-11-25T15:00:00.000Z',
          status: 'checked_in',
        },
      ],
      now,
    );
    expect(hoursHit.code).toBe('DAILY_HOURS_LIMIT');
  });
});
