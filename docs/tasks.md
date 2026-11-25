# Tasks: Library Management System

Legend: `[ ]` todo · `[x]` done · **(P0)** must · **(P1)** should · **(P2)** nice-to-have

---

## Phase 0: Project Setup
- [x] Create repo and folders: `client/`, `server/`, `supabase/`, `docs/` (P0)
- [x] Init client: Vite + React + TypeScript (P0)
- [x] Install client deps: tailwindcss, framer-motion, lucide-react, react-router-dom, recharts, @supabase/supabase-js (P0)
- [x] Init server: Node + Express + TypeScript (P0)
- [x] Install server deps: express, cors, helmet, dotenv, @supabase/supabase-js, nodemailer, qrcode, exceljs, node-cron, zod, express-rate-limit (P0)
- [x] Configure ESLint, Prettier, `.gitignore`, `.env.example` for client and server (P0)
- [x] Add README, PRD and tasks files to repo (P0)
- [x] Set up Antigravity workspace rules / project context file (P1)

## Phase 1: Supabase & Database
- [x] Create Supabase project (`deunnaibdmlohgtnxdsz`) (P0)
- [x] Write migration: `profiles` + trigger to auto-create profile on signup (P0)
- [x] Write migration: `floors`, `seats` (P0)
- [x] Write migration: `bookings` with exclusion constraint against overlap (P0)
- [x] Write migration: `books`, `book_issues` (P0)
- [x] Write migration: `settings`, `holidays`, `announcements` (P0)
- [x] Write migration: `favourite_seats`, `booking_groups`, `group_invites` (P1)
- [x] Write migration: `occupancy_snapshots` (P1)
- [x] Add indexes on bookings (user, seat, time) (P0)
- [x] Write RLS policies for every table (student own-data, admin full) (P0)
- [x] Seed data: 3 floors, sections, tables, seats with x/y coordinates (P0)
- [x] Seed data: sample books and default settings (P0)
- [x] Seed sample bookings / historical occupancy snapshots for demo (P2)

## Phase 2: Authentication & Roles
- [ ] Enable Email + Google providers in Supabase (P0)
- [ ] Configure Google OAuth client and redirect URLs (P0)
- [x] Build Login / Sign-up page (Gmail button + email/password) (P0)
- [x] Build Forgot Password and Reset Password pages (P0)
- [x] Create `useAuth` hook and auth context (session, profile, role) (P0)
- [x] Build `ProtectedRoute` and `RoleRoute` guards (P0)
- [x] Redirect rules: student → `/dashboard`, admin → `/admin` (P0)
- [x] Block students from `/admin/*` and admins from student-only booking pages (P0)
- [x] Express middleware: verify Supabase JWT (P0)
- [x] Express middleware: `requireRole('admin')` (P0)
- [x] Promote first admin (`kushalkumar78k@gmail.com` via `private.admin_emails` bootstrap) (P0)
- [x] Test: student cannot call admin APIs or read others' bookings (P0)

## Phase 3: Public Home & Layout
- [x] App shell: navbar, sidebar, footer, routing map (P0)
- [x] Light/Dark theme toggle with persistence (P1)
- [x] Cinematic 3D book hero on home page, before login (P1)
- [x] Hero books link to the catalogue (P1)
- [x] Responsive layouts for mobile/tablet/desktop (P0)
- [x] Page and component animations with Framer Motion (P1)
- [x] Announcement banner component (P1)

## Phase 4: Seat Map & Seat Data
- [x] Define seat layout data format (floor, section, table, seat, x, y) (P0)
- [x] `GET /api/seats?floor=&date=&from=&to=` returns seats with live status (P0)
- [x] Build `SeatMap` component for 3 floors with floor tabs (P0)
- [x] Zoom and pan controls (P0)
- [x] Section filters (P0)
- [x] Table/seat search with highlight and jump-to (P0)
- [x] Status colours and legend: available / reserved / occupied (P0)
- [x] Blocked-seat styling (P1)
- [x] Polling refresh every 2 minutes (P0)

## Phase 5: Booking Flow
- [x] Booking form: date picker limited to today + 7 days (P0)
- [x] Start time picker, duration selector 30 min to 8 h (P0)
- [x] Live floor-plan preview beside the form (P0)
- [x] Booking summary panel (P0)
- [x] Server validation with zod: past time, closing time, holidays (P0)
- [x] Server validation: seat double-booking (P0)
- [x] Server validation: student overlapping bookings (P0)
- [x] Server validation: daily booking limit / hours limit (P0)
- [x] `POST /api/bookings` transactional create (P0)
- [x] `DELETE /api/bookings/:id` cancel (P0)
- [x] My Reservations page: Upcoming / Current / Previous tabs (P0)
- [x] Extend booking (P1)
- [x] Move booking to another seat/time (P1)
- [x] Favourite seats: add/remove, one-tap book (P1)
- [x] Group / discussion-room booking: create group, invite by email, accept/decline (P1)

## Phase 6: Entry Codes, QR & Email
- [x] Generate unique 6-digit code per booking (stored hashed) (P0)
- [x] Build HMAC-SHA256 signed token tied to booking, seat, date, time (P0)
- [x] Generate QR image from signed token (P0)
- [x] Nodemailer setup with Gmail SMTP + App Password (P0)
- [x] Confirmation email template: seat details, QR, 6-digit code (P0)
- [x] Entry pass modal after booking (P0)
- [x] Entry pass card inside My Reservations (P0)
- [x] Cancellation email (P1)
- [x] Reminder email job before booking start (P1)
- [x] Add-to-calendar: Google Calendar link (P1)
- [x] Add-to-calendar: `.ics` download (P1)

## Phase 7: Gate Check
- [x] `POST /api/gate/verify` accepting QR token or 6-digit code (P0)
- [x] Verify signature, booking status, time window (P0)
- [x] Return `VALID`, `TOO EARLY`, `EXPIRED`, `INVALID` (P0)
- [x] Single-use: atomic update of `used_at` (P0)
- [x] Reject cancelled bookings (P0)
- [x] Record check-in time and status in Supabase on VALID (P0)
- [x] Gate Check page UI with big result states (P0)
- [x] Camera QR scanner component (P0)
- [x] Manual 6-digit code input fallback (P0)
- [x] Rate limit gate endpoint (P0)
- [x] Tests: forged token, reused code, cancelled, early, expired (P0)

## Phase 8: Library Books
- [x] `GET /api/books` with search and status filter (P0)
- [x] Catalogue page with search and borrowed badge (P0)
- [x] Issue book endpoint: enforce one active book per student (P0)
- [x] Generate book pickup code and show on screen/email (P0)
- [x] Admin: confirm handover by scan or code (P0)
- [x] Admin: mark returned (P0)
- [x] Auto-cancel unclaimed issues after pickup window (P1)
- [x] My Books section in student dashboard (P1)
- [x] Admin: add / edit / remove books (P1)

## Phase 9: Student Dashboard
- [x] Occupancy ring (P0)
- [x] Stat cards (active booking, hours this week, books issued) (P0)
- [x] Floor-wise availability (P0)
- [x] Upcoming bookings widget (P0)
- [x] Busy-time chart from occupancy snapshots (P1)
- [x] Friendly insight text, e.g. "usually quiet at 2 PM" (P1)

## Phase 10: Admin Panel
- [x] Admin dashboard: stats and floor occupancy (P0)
- [x] Reservations table with filters and time-left column (P0)
- [x] Filter tabs: All, Upcoming, Booked, Checked in (P0)
- [x] Refresh button (P0)
- [x] Live check-in / check-out actions (P0)
- [x] "Who is inside now" list (P0)
- [x] Admin scanner: camera QR + manual code (P0)
- [x] Settings page: library hours, holidays, booking rules (P0)
- [x] Block / unblock seat or table for maintenance (P1)
- [x] Announcements manager (P1)
- [x] Analytics page: peak hours, busiest floors, no-show rate (P1)
- [x] Export reservations to Excel with exceljs (P1)

## Phase 11: Scheduled Jobs (node-cron)
- [x] No-show auto-release after 15 min (every minute) (P0)
- [x] Mark finished bookings as completed (P0)
- [x] Reminder email job (P1)
- [x] Occupancy snapshot every 2 min (P1)
- [x] Daily reset of sample bookings at midnight (P2)
- [x] Make all jobs idempotent and log runs (P0)

## Phase 12: PWA
- [x] Web manifest with name, icons, theme colour (P1)
- [x] Service worker with app-shell caching (P1)
- [x] Install prompt UI (P1)
- [ ] Test install on Android and iOS (P1)

## Phase 13: Testing & QA
- [x] Unit tests: validation rules, signing, time-window logic (P0)
- [x] API tests: bookings, gate, role access (P0)
- [ ] RLS tests with student vs admin tokens *(against live Supabase project)* (P0)
- [ ] Concurrency test: two users book the same seat *(against live Supabase Postgres)* (P0)
- [ ] Manual test of full flow: book → email → gate scan → check-out (P0)
- [ ] Responsive and dark-mode visual check (P1)
- [x] Accessibility pass (keyboard, contrast, labels) (P1)

## Phase 14: Deployment
- [ ] Deploy client (Netlify — `netlify.toml` configured) (P0)
- [ ] Deploy server (Render — `render.yaml` configured) with always-on process for cron (P0)
- [ ] Set production env vars and Supabase redirect URLs (P0)
- [ ] Update Google OAuth authorised origins (P0)
- [ ] Production smoke test (P0)
- [ ] Add basic error logging / monitoring (P1)
- [ ] Final README polish with screenshots (P1)

---

## Suggested Build Order
1. Phase 0 → 1 → 2 (foundation)
2. Phase 4 → 5 (core value: seat booking)
3. Phase 6 → 7 (entry and gate)
4. Phase 8 → 9 → 10 → 11 (books, dashboards, admin, jobs)
5. Phase 3 polish, 12, 13, 14

## Open Decisions
- [ ] Allowed email domain (any Gmail vs college only — configurable via `settings.allowed_email_domain`)
- [ ] Book loan period and overdue handling (default 14 days via `settings.book_loan_days`)
- [ ] Group room capacity and invite acceptance rules
