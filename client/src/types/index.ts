export type UserRole = 'student' | 'admin';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url?: string | null;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  description: string;
}

export type SeatStatus = 'available' | 'reserved' | 'occupied' | 'blocked';

export interface Seat {
  id: string;
  floor_id: string;
  section: string;
  table_no: string;
  seat_no: string;
  label: string;
  seat_type: 'desk' | 'quiet' | 'power' | 'group_room';
  capacity: number;
  x: number;
  y: number;
  is_blocked: boolean;
  block_reason?: string | null;
  status: SeatStatus;
  is_favourite?: boolean;
  active_booking?: {
    start_at: string;
    end_at: string;
    status: string;
    is_mine: boolean;
  } | null;
}

export interface EntryPass {
  sixDigitCode?: string;
  signedToken: string;
  qrDataUrl: string;
  googleCalendarUrl: string;
}

export interface BookingRecord {
  id: string;
  user_id: string;
  seat_id: string;
  start_at: string;
  end_at: string;
  status: 'booked' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  used_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  minutesLeft?: number | null;
  seat?: {
    id: string;
    label: string;
    section: string;
    table_no: string;
    seat_no: string;
    seat_type?: string;
    floor?: { id: string; name: string; level: number };
  };
  student?: {
    id: string;
    full_name: string;
    email: string;
  };
  group?: {
    id: string;
    name: string;
    invites?: Array<{ id: string; email: string; status: string }>;
  } | null;
  entryPass?: EntryPass | null;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  description: string;
  cover_url?: string | null;
  published_year?: number | null;
  shelf_location: string;
  status: 'available' | 'reserved' | 'borrowed';
  featured_in_hero: boolean;
}

export interface BookIssue {
  id: string;
  book_id: string;
  user_id: string;
  issued_at: string;
  pickup_expires_at: string;
  picked_up_at?: string | null;
  due_at?: string | null;
  returned_at?: string | null;
  pickup_code?: string | null;
  status: 'pending_pickup' | 'borrowed' | 'returned' | 'cancelled' | 'expired';
  book?: Book;
  student?: { id: string; full_name: string; email: string };
}

export interface Announcement {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'urgent';
  active: boolean;
  created_at: string;
}

export interface LibrarySettings {
  id: number;
  open_time: string;
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

export interface Holiday {
  id: string;
  date: string;
  label: string;
}
