-- ============================================================================
-- Library Management System — Row Level Security (RLS) Policies
-- Enforces student own-data isolation and admin-only management at DB layer.
-- Follows Supabase best practices:
--   - RLS enabled on every public table
--   - Target roles specified with `TO authenticated` / `TO anon`
--   - `(select auth.uid())` wrapped for initPlan caching
--   - SECURITY DEFINER helper placed in unexposed `private` schema
-- ============================================================================

-- Helper: check if the calling authenticated user has role = 'admin'
create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- Helper: check if calling user owns or is invited to a booking group
create or replace function private.can_access_group(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.booking_groups g
    where g.id = gid
      and g.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.group_invites gi
    join public.profiles p on lower(p.email) = lower(gi.email)
    where gi.group_id = gid
      and p.id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
revoke all on function private.can_access_group(uuid) from public, anon;
grant execute on function private.can_access_group(uuid) to authenticated;

-- ============================================================================
-- Enable RLS on all public tables
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.floors enable row level security;
alter table public.seats enable row level security;
alter table public.booking_groups enable row level security;
alter table public.group_invites enable row level security;
alter table public.bookings enable row level security;
alter table public.favourite_seats enable row level security;
alter table public.books enable row level security;
alter table public.book_issues enable row level security;
alter table public.settings enable row level security;
alter table public.holidays enable row level security;
alter table public.announcements enable row level security;
alter table public.occupancy_snapshots enable row level security;
alter table public.gate_logs enable row level security;

-- ============================================================================
-- PROFILES
-- ============================================================================
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

-- Students can update their own name/avatar, but CANNOT escalate their role
create policy "profiles_update_own_safe"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select p.role from public.profiles p where p.id = (select auth.uid()))
  );

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ============================================================================
-- FLOORS & SEATS
-- ============================================================================
create policy "floors_select_authenticated"
  on public.floors for select
  to authenticated
  using (true);

create policy "floors_admin_write"
  on public.floors for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "seats_select_authenticated"
  on public.seats for select
  to authenticated
  using (true);

create policy "seats_admin_write"
  on public.seats for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ============================================================================
-- BOOKINGS
-- ============================================================================
create policy "bookings_select_own_or_admin"
  on public.bookings for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "bookings_insert_own"
  on public.bookings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "bookings_update_own_or_admin"
  on public.bookings for update
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()))
  with check ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "bookings_delete_admin_only"
  on public.bookings for delete
  to authenticated
  using ((select private.is_admin()));

-- ============================================================================
-- FAVOURITE SEATS
-- ============================================================================
create policy "favourite_seats_select_own"
  on public.favourite_seats for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "favourite_seats_insert_own"
  on public.favourite_seats for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "favourite_seats_delete_own"
  on public.favourite_seats for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- BOOKING GROUPS & INVITES
-- ============================================================================
create policy "booking_groups_select_member_or_admin"
  on public.booking_groups for select
  to authenticated
  using ((select private.can_access_group(id)) or (select private.is_admin()));

create policy "booking_groups_insert_own"
  on public.booking_groups for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "booking_groups_update_owner_or_admin"
  on public.booking_groups for update
  to authenticated
  using ((select auth.uid()) = owner_id or (select private.is_admin()))
  with check ((select auth.uid()) = owner_id or (select private.is_admin()));

create policy "booking_groups_delete_owner_or_admin"
  on public.booking_groups for delete
  to authenticated
  using ((select auth.uid()) = owner_id or (select private.is_admin()));

create policy "group_invites_select_member_or_admin"
  on public.group_invites for select
  to authenticated
  using ((select private.can_access_group(group_id)) or (select private.is_admin()));

create policy "group_invites_insert_owner"
  on public.group_invites for insert
  to authenticated
  with check (
    exists (
      select 1 from public.booking_groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
  );

create policy "group_invites_update_invitee_or_owner"
  on public.group_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and lower(p.email) = lower(group_invites.email)
    )
    or exists (
      select 1 from public.booking_groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
    or (select private.is_admin())
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and lower(p.email) = lower(group_invites.email)
    )
    or exists (
      select 1 from public.booking_groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

-- ============================================================================
-- BOOKS (publicly browsable for the hero & catalogue; admin-managed)
-- ============================================================================
create policy "books_select_public"
  on public.books for select
  to anon, authenticated
  using (true);

create policy "books_admin_write"
  on public.books for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ============================================================================
-- BOOK ISSUES
-- ============================================================================
create policy "book_issues_select_own_or_admin"
  on public.book_issues for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "book_issues_insert_own"
  on public.book_issues for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "book_issues_admin_update"
  on public.book_issues for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ============================================================================
-- SETTINGS, HOLIDAYS, ANNOUNCEMENTS, OCCUPANCY SNAPSHOTS, GATE LOGS
-- ============================================================================
create policy "settings_select_authenticated"
  on public.settings for select
  to authenticated
  using (true);

create policy "settings_admin_write"
  on public.settings for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "holidays_select_authenticated"
  on public.holidays for select
  to authenticated
  using (true);

create policy "holidays_admin_write"
  on public.holidays for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "announcements_select_active_or_admin"
  on public.announcements for select
  to anon, authenticated
  using (active = true or (select private.is_admin()));

create policy "announcements_admin_write"
  on public.announcements for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "occupancy_snapshots_select_authenticated"
  on public.occupancy_snapshots for select
  to authenticated
  using (true);

create policy "occupancy_snapshots_admin_write"
  on public.occupancy_snapshots for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "gate_logs_admin_only"
  on public.gate_logs for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
