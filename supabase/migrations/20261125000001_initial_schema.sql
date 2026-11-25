-- ============================================================================
-- Library Management System — Initial Database Schema
-- Phase 1: Core tables, constraints, triggers, and performance indexes
-- ============================================================================

-- Required extensions
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- Private schema for internal RLS helper functions (not exposed via Data API)
create schema if not exists private;

-- ============================================================================
-- 1. PROFILES (linked to auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Auto-create profile row when a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url',
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. FLOORS & SEATS
-- ============================================================================
create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level int not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  section text not null,
  table_no text not null,
  seat_no text not null,
  label text not null unique,
  seat_type text not null default 'desk' check (seat_type in ('desk', 'quiet', 'power', 'group_room')),
  capacity int not null default 1 check (capacity >= 1 and capacity <= 12),
  x numeric(6,2) not null,
  y numeric(6,2) not null,
  is_blocked boolean not null default false,
  block_reason text,
  created_at timestamptz not null default now(),
  unique (floor_id, table_no, seat_no)
);

create index if not exists seats_floor_section_idx on public.seats (floor_id, section);
create index if not exists seats_blocked_idx on public.seats (is_blocked) where is_blocked = true;

-- ============================================================================
-- 3. GROUP BOOKINGS & INVITES
-- ============================================================================
create table if not exists public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  room_id uuid references public.seats(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists booking_groups_owner_idx on public.booking_groups (owner_id);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.booking_groups(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, email)
);

create index if not exists group_invites_email_idx on public.group_invites (lower(email));
create index if not exists group_invites_group_idx on public.group_invites (group_id);

-- ============================================================================
-- 4. BOOKINGS (with DB-level overlap exclusion constraints)
-- ============================================================================
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'checked_in', 'completed', 'cancelled', 'no_show')),
  entry_code_hash text not null,
  token_sig text not null,
  used_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  reminder_sent_at timestamptz,
  group_id uuid references public.booking_groups(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_valid check (end_at > start_at),
  -- Prevent double-booking the same seat in overlapping intervals
  constraint bookings_no_seat_overlap exclude using gist (
    seat_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('booked', 'checked_in')),
  -- Prevent the same student from holding overlapping active bookings
  constraint bookings_no_user_overlap exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('booked', 'checked_in'))
);

create index if not exists bookings_user_start_idx on public.bookings (user_id, start_at desc);
create index if not exists bookings_seat_start_idx on public.bookings (seat_id, start_at);
create index if not exists bookings_status_start_idx on public.bookings (status, start_at);
create index if not exists bookings_entry_code_hash_idx on public.bookings (entry_code_hash)
  where status in ('booked', 'checked_in');
create index if not exists bookings_reminder_idx on public.bookings (start_at)
  where status = 'booked' and reminder_sent_at is null;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. FAVOURITE SEATS
-- ============================================================================
create table if not exists public.favourite_seats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, seat_id)
);

create index if not exists favourite_seats_user_idx on public.favourite_seats (user_id);

-- ============================================================================
-- 6. BOOKS & BOOK ISSUES
-- ============================================================================
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  isbn text not null unique,
  category text not null,
  description text not null default '',
  cover_url text,
  published_year int,
  shelf_location text not null default '',
  status text not null default 'available' check (status in ('available', 'reserved', 'borrowed')),
  featured_in_hero boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_status_idx on public.books (status);
create index if not exists books_category_idx on public.books (category);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

create table if not exists public.book_issues (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default now(),
  pickup_code_hash text not null,
  pickup_expires_at timestamptz not null,
  picked_up_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  status text not null default 'pending_pickup'
    check (status in ('pending_pickup', 'borrowed', 'returned', 'cancelled', 'expired'))
);

create index if not exists book_issues_user_idx on public.book_issues (user_id, issued_at desc);
create index if not exists book_issues_book_idx on public.book_issues (book_id);
create index if not exists book_issues_pickup_hash_idx on public.book_issues (pickup_code_hash)
  where status = 'pending_pickup';
create unique index if not exists book_issues_one_active_per_book_idx
  on public.book_issues (book_id)
  where status in ('pending_pickup', 'borrowed');

-- ============================================================================
-- 7. SETTINGS, HOLIDAYS, ANNOUNCEMENTS, OCCUPANCY SNAPSHOTS & GATE LOGS
-- ============================================================================
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  open_time time not null default '08:00',
  close_time time not null default '22:00',
  max_bookings_per_day int not null default 2 check (max_bookings_per_day >= 1 and max_bookings_per_day <= 10),
  max_hours_per_day numeric(4,1) not null default 8.0 check (max_hours_per_day >= 1 and max_hours_per_day <= 24),
  early_entry_min int not null default 15 check (early_entry_min >= 0 and early_entry_min <= 60),
  no_show_min int not null default 15 check (no_show_min >= 5 and no_show_min <= 60),
  book_limit int not null default 1 check (book_limit >= 1 and book_limit <= 10),
  book_pickup_hours int not null default 24 check (book_pickup_hours >= 1 and book_pickup_hours <= 168),
  book_loan_days int not null default 14 check (book_loan_days >= 1 and book_loan_days <= 90),
  allowed_email_domain text not null default '',
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  level text not null default 'info' check (level in ('info', 'warning', 'urgent')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx on public.announcements (active, created_at desc);

create table if not exists public.occupancy_snapshots (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  taken_at timestamptz not null default now(),
  occupied_count int not null default 0,
  reserved_count int not null default 0,
  total_seats int not null default 0
);

create index if not exists occupancy_snapshots_floor_time_idx
  on public.occupancy_snapshots (floor_id, taken_at desc);
create index if not exists occupancy_snapshots_time_idx
  on public.occupancy_snapshots (taken_at desc);

create table if not exists public.gate_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  method text not null check (method in ('qr', 'code', 'manual_checkin', 'manual_checkout')),
  result text not null check (result in ('VALID', 'TOO EARLY', 'EXPIRED', 'INVALID', 'CHECKED_OUT')),
  created_at timestamptz not null default now()
);

create index if not exists gate_logs_booking_idx on public.gate_logs (booking_id, created_at desc);
