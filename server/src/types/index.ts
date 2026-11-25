import type { Request } from 'express';

export type UserRole = 'student' | 'admin';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  accessToken?: string;
}

export type BookingStatus = 'booked' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
export type SeatLiveStatus = 'available' | 'reserved' | 'occupied' | 'blocked';
export type GateVerifyResult = 'VALID' | 'TOO EARLY' | 'EXPIRED' | 'INVALID';

export interface LibrarySettings {
  id: number;
  open_time: string; // "HH:MM" or "HH:MM:SS"
  close_time: string;
  max_bookings_per_day: number;
  max_hours_per_day: number;
  early_entry_min: number;
  no_show_min: number;
  book_limit: number;
  book_pickup_hours: number;
  book_loan_days: number;
  allowed_email_domain: string;
  timezone: string;
}

export interface HolidayRecord {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
}

export interface ExistingBookingSlot {
  id: string;
  seat_id: string;
  user_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
}
