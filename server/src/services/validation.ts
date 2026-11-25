import type { ExistingBookingSlot, HolidayRecord, LibrarySettings } from '../types/index.js';

export interface BookingValidationInput {
  seatId: string;
  startAt: Date;
  endAt: Date;
  excludeBookingId?: string;
}

export interface ValidationResult {
  ok: boolean;
  code?:
    | 'INVALID_TIME_RANGE'
    | 'PAST_TIME'
    | 'ADVANCE_LIMIT'
    | 'DURATION_INVALID'
    | 'OUTSIDE_HOURS'
    | 'HOLIDAY'
    | 'SEAT_CONFLICT'
    | 'USER_CONFLICT'
    | 'DAILY_BOOKING_LIMIT'
    | 'DAILY_HOURS_LIMIT';
  message?: string;
}

interface LocalDateParts {
  dateStr: string; // YYYY-MM-DD
  minutesFromMidnight: number;
}

export function getDatePartsInTz(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = Number(map.hour === '24' ? '0' : map.hour);
  const minute = Number(map.minute);
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    minutesFromMidnight: hour * 60 + minute,
  };
}

export function parseTimeToMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

function daysBetweenDateStrings(fromDateStr: string, toDateStr: string): number {
  const a = Date.UTC(
    Number(fromDateStr.slice(0, 4)),
    Number(fromDateStr.slice(5, 7)) - 1,
    Number(fromDateStr.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toDateStr.slice(0, 4)),
    Number(toDateStr.slice(5, 7)) - 1,
    Number(toDateStr.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Pure, deterministic booking rule validator enforcing PRD §4 Business Rules:
 * 1. Advance window up to 7 days
 * 2. Duration 30 min to 8 h in 30-min increments
 * 3. Within library open/close hours and not on a holiday
 * 4. No seat overlap & no student overlap
 * 5. Daily booking count & daily total hours limit
 */
export function validateBookingRules(
  input: BookingValidationInput,
  settings: LibrarySettings,
  holidays: HolidayRecord[],
  existingSeatBookings: ExistingBookingSlot[],
  existingUserBookings: ExistingBookingSlot[],
  now = new Date(),
): ValidationResult {
  const { startAt, endAt, excludeBookingId } = input;
  const tz = settings.timezone || 'Asia/Kolkata';

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { ok: false, code: 'INVALID_TIME_RANGE', message: 'End time must be after start time.' };
  }

  // Allow 2-minute clock skew for "book now" actions
  if (startAt.getTime() < now.getTime() - 2 * 60_000) {
    return { ok: false, code: 'PAST_TIME', message: 'Cannot book a slot in the past.' };
  }

  const durationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  if (durationMin < 30 || durationMin > 480 || durationMin % 30 !== 0) {
    return {
      ok: false,
      code: 'DURATION_INVALID',
      message: 'Booking duration must be between 30 minutes and 8 hours in 30-minute steps.',
    };
  }

  const nowLocal = getDatePartsInTz(now, tz);
  const startLocal = getDatePartsInTz(startAt, tz);
  const endLocal = getDatePartsInTz(endAt, tz);

  const dayDiff = daysBetweenDateStrings(nowLocal.dateStr, startLocal.dateStr);
  if (dayDiff < 0) {
    return { ok: false, code: 'PAST_TIME', message: 'Cannot book a past date.' };
  }
  if (dayDiff > 7) {
    return {
      ok: false,
      code: 'ADVANCE_LIMIT',
      message: 'Seats can be reserved up to 7 days in advance.',
    };
  }

  // Holiday check
  const holiday = holidays.find((h) => h.date === startLocal.dateStr);
  if (holiday) {
    return {
      ok: false,
      code: 'HOLIDAY',
      message: `The library is closed on ${holiday.date} (${holiday.label}).`,
    };
  }

  // Library open/close hours check (must start and end on the same day within hours)
  const openMin = parseTimeToMinutes(settings.open_time);
  const closeMin = parseTimeToMinutes(settings.close_time);
  const endMinutesEffective =
    endLocal.dateStr !== startLocal.dateStr && endLocal.minutesFromMidnight === 0
      ? 1440
      : endLocal.minutesFromMidnight;

  if (
    (endLocal.dateStr !== startLocal.dateStr && endMinutesEffective !== 1440) ||
    startLocal.minutesFromMidnight < openMin ||
    endMinutesEffective > closeMin
  ) {
    return {
      ok: false,
      code: 'OUTSIDE_HOURS',
      message: `Bookings must fall within library hours (${settings.open_time.slice(0, 5)} – ${settings.close_time.slice(0, 5)}).`,
    };
  }

  // Seat overlap check
  const activeStatuses = new Set(['booked', 'checked_in']);
  const seatConflict = existingSeatBookings.some((b) => {
    if (b.id === excludeBookingId || !activeStatuses.has(b.status)) return false;
    return intervalsOverlap(startAt, endAt, new Date(b.start_at), new Date(b.end_at));
  });
  if (seatConflict) {
    return {
      ok: false,
      code: 'SEAT_CONFLICT',
      message: 'This seat is already booked during the selected time window.',
    };
  }

  // Student overlap check
  const userActiveOnOtherSlots = existingUserBookings.filter(
    (b) => b.id !== excludeBookingId && activeStatuses.has(b.status),
  );
  const userConflict = userActiveOnOtherSlots.some((b) =>
    intervalsOverlap(startAt, endAt, new Date(b.start_at), new Date(b.end_at)),
  );
  if (userConflict) {
    return {
      ok: false,
      code: 'USER_CONFLICT',
      message: 'You already have an overlapping reservation during this time.',
    };
  }

  // Daily student limits (count non-cancelled bookings on the same calendar date in library TZ)
  const sameDayBookings = existingUserBookings.filter((b) => {
    if (b.id === excludeBookingId) return false;
    if (b.status === 'cancelled') return false;
    return getDatePartsInTz(new Date(b.start_at), tz).dateStr === startLocal.dateStr;
  });

  if (sameDayBookings.length >= settings.max_bookings_per_day) {
    return {
      ok: false,
      code: 'DAILY_BOOKING_LIMIT',
      message: `Daily limit reached: you can hold up to ${settings.max_bookings_per_day} bookings per day.`,
    };
  }

  const existingMinutesToday = sameDayBookings.reduce((sum, b) => {
    return sum + Math.max(0, (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60_000);
  }, 0);

  if (existingMinutesToday + durationMin > Number(settings.max_hours_per_day) * 60) {
    return {
      ok: false,
      code: 'DAILY_HOURS_LIMIT',
      message: `Daily hour limit exceeded: maximum ${settings.max_hours_per_day} hours per day.`,
    };
  }

  return { ok: true };
}

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(params: {
  title: string;
  details: string;
  location: string;
  startAt: Date;
  endAt: Date;
}): string {
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${formatIcsUtc(params.startAt)}/${formatIcsUtc(params.endAt)}`,
    details: params.details,
    location: params.location,
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

export function generateIcsFile(params: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date;
}): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyDock//Seat Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.uid}@studydock`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(params.startAt)}`,
    `DTEND:${formatIcsUtc(params.endAt)}`,
    `SUMMARY:${esc(params.title)}`,
    `DESCRIPTION:${esc(params.description)}`,
    `LOCATION:${esc(params.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
