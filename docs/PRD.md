# Product Requirements Document: Library Management System

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Draft |
| **Platform** | Web app + installable PWA |
| **Backend / DB** | Node.js + Express, Supabase (Postgres + Auth) |

---

## 1. Overview

A web platform for a college library that lets students reserve seats, issue books online, and enter the library using a signed QR or a unique 6-digit code. Admins monitor occupancy, verify entry at the gate, manage books and seats, and view analytics.

### 1.1 Problems solved
- Students can't tell if a seat is free before walking in.
- Manual registers for entry and book issue are slow and error-prone.
- Librarians have no data on peak hours, no-shows or busy floors.
- Seats get held by people who never show up.

### 1.2 Goals
1. Let students find and book a seat in under 1 minute.
2. Make entry verification instant, secure and single-use.
3. Give admins real-time visibility and automate no-show release.
4. Move book issuing fully online (one source of truth in Supabase).

### 1.3 Non-goals (v1)
- Payments or fines
- Physical RFID / barcode integration for books
- Native iOS/Android apps (PWA only)
- Multiple library branches

---

## 2. Users & Roles

| Role | Description | Key abilities |
|---|---|---|
| **Visitor** | Not signed in | See cinematic hero home page, sign in / sign up |
| **Student** | Verified Gmail user | Book seats, manage reservations, issue books, view dashboard |
| **Admin** | Library staff | Gate check, check-in/out, manage reservations, books, settings, analytics |

**Role protection:** Every page, API route and database table enforces role. A student hitting an admin URL is redirected; an admin is redirected away from student-only booking pages. Enforced at three layers: React route guards, Express middleware (Supabase JWT + role), Supabase RLS.

---

## 3. Functional Requirements

Priority: **P0** must-have, **P1** should-have, **P2** nice-to-have.

### 3.1 Authentication & Accounts
| ID | Requirement | Priority |
|---|---|---|
| AUTH-1 | Sign in with Gmail (Google OAuth via Supabase) for students and admins | P0 |
| AUTH-2 | Email + password sign-up/sign-in via Supabase | P0 |
| AUTH-3 | Password reset by email link | P0 |
| AUTH-4 | Role stored in `profiles.role` (`student` / `admin`); default `student` | P0 |
| AUTH-5 | Role-protected routes (client + API + RLS) | P0 |
| AUTH-6 | All data stored in hosted Supabase, nothing authoritative in browser storage | P0 |

### 3.2 Seat Booking
| ID | Requirement | Priority |
|---|---|---|
| BK-1 | Interactive seat map, 3 floors, with zoom and pan | P0 |
| BK-2 | Section filters and table/seat search | P0 |
| BK-3 | Live status per seat: `available`, `reserved`, `occupied` | P0 |
| BK-4 | Booking form: date (today to +7 days), start time, duration 30 min to 8 h | P0 |
| BK-5 | Live floor-plan preview beside the form, highlighting the chosen seat/time | P0 |
| BK-6 | Booking summary before confirming | P0 |
| BK-7 | Validation: closing time, past times, double-booking (same seat or same student overlapping) | P0 |
| BK-8 | Per-student booking limits (e.g. max bookings/day, max hours/day) from admin settings | P0 |
| BK-9 | My Reservations tabs: Upcoming, Current, Previous; cancel from list | P0 |
| BK-10 | Extend or move an existing booking (re-validated) | P1 |
| BK-11 | Favourite seats with one-tap booking | P1 |
| BK-12 | Group / discussion-room booking with invites (invitees by Gmail) | P1 |

### 3.3 Confirmation & Entry
| ID | Requirement | Priority |
|---|---|---|
| EN-1 | Confirmation email (Nodemailer + Gmail SMTP) with seat, floor, date, time, **QR code** and **unique 6-digit code** | P0 |
| EN-2 | Entry code is HMAC-signed and bound to booking, seat, date and time; cannot be forged | P0 |
| EN-3 | Entry pass shown on screen after booking and under My Reservations | P0 |
| EN-4 | Gate Check page returns `VALID`, `TOO EARLY`, `EXPIRED`, `INVALID` | P0 |
| EN-5 | Single-use: code stops working after first successful scan | P0 |
| EN-6 | Cancelled bookings fail at the gate | P0 |
| EN-7 | Camera QR scanner on Gate Check, plus manual 6-digit entry | P0 |
| EN-8 | Entry scan writes check-in time to Supabase | P0 |
| EN-9 | Reminder email before booking starts | P1 |
| EN-10 | Add to calendar: Google Calendar link and `.ics` download | P1 |

### 3.4 Library Books
| ID | Requirement | Priority |
|---|---|---|
| LB-1 | Book catalogue with search and borrowed/available status | P0 |
| LB-2 | Books can be issued **only through the website** (no walk-in issue) | P0 |
| LB-3 | A student can hold **one book at a time** (configurable limit) | P0 |
| LB-4 | Issue generates a code; admin confirms handover at the desk by scanner or manual code | P0 |
| LB-5 | Return flow marks book available again (admin action) | P0 |
| LB-6 | Catalogue linked from the hero's 3D books | P1 |
| LB-7 | Admin can add / edit / remove books | P1 |

### 3.5 Student Dashboard
| ID | Requirement | Priority |
|---|---|---|
| SD-1 | Occupancy ring, stat cards, floor-wise availability | P0 |
| SD-2 | Upcoming bookings list | P0 |
| SD-3 | Busy-time chart (e.g. "usually quiet at 2 PM") from historical occupancy | P1 |
| SD-4 | Data auto-refreshes every 2 minutes | P0 |

### 3.6 Admin
| ID | Requirement | Priority |
|---|---|---|
| AD-1 | Dashboard: stats, floor occupancy, reservations table with filters and time left | P0 |
| AD-2 | Filter tabs: All, Upcoming, Booked, Checked in; refresh button | P0 |
| AD-3 | Live check-in / check-out; "who is inside now" | P0 |
| AD-4 | Auto-release no-shows 15 minutes after start | P0 |
| AD-5 | Scanner for user QR or manual unique-code entry | P0 |
| AD-6 | Analytics: peak hours, busiest floors, no-show rate | P1 |
| AD-7 | Export reservations to Excel (exceljs) | P1 |
| AD-8 | Settings: library hours, holidays, booking rules | P0 |
| AD-9 | Block seat/table for maintenance | P1 |
| AD-10 | Announcement banner shown to students | P1 |

### 3.6 Design & Experience
| ID | Requirement | Priority |
|---|---|---|
| UX-1 | Responsive layout (mobile to desktop) | P0 |
| UX-2 | Smooth animations (Framer Motion) | P1 |
| UX-3 | Cinematic 3D book hero as the public home page, in front of login | P1 |
| UX-4 | Light and Dark mode across the app | P1 |
| UX-5 | Installable PWA (manifest, service worker, icons) | P1 |
| UX-6 | Sample bookings reset daily (demo mode) | P2 |

---

## 4. Business Rules

1. **Advance window:** up to 7 days ahead.
2. **Duration:** 30 min minimum, 8 h maximum, in 30-min steps.
3. **Hours:** bookings must start and end within library hours and not on holidays (admin-configurable).
4. **No overlap:** a seat can't have two active bookings overlapping; a student can't have overlapping bookings.
5. **Limits:** daily max bookings/hours per student (default: 2 bookings, 8 h).
6. **No-show:** if not checked in 15 min after start, booking becomes `no_show` and the seat is released.
7. **Single-use code:** first valid scan sets `used_at`; later scans return `INVALID`.
8. **Early entry:** allowed up to 15 min before start (configurable); earlier shows `TOO EARLY`.
9. **Expiry:** after booking end, shows `EXPIRED`.
10. **Books:** one active issue per student; issue code valid for a pickup window (default 24 h) else auto-cancelled.
11. **Blocked seats** can't be booked; existing bookings on a newly blocked seat are cancelled and the student is notified.

---

## 5. Entry Code Design

- **6-digit code:** random, unique among active bookings, stored hashed.
- **Signed token:** `payload = bookingId.seatId.startISO.endISO`, `signature = HMAC-SHA256(payload, ENTRY_CODE_SECRET)`. QR content = `base64url(payload).signature`.
- **Verification (server only):** recompute signature → load booking → check status ≠ cancelled → check window → atomic `UPDATE ... SET used_at = now() WHERE id = ? AND used_at IS NULL` → return result.
- The secret lives only on the server; the client never sees it.

**Gate results**

| Result | Meaning |
|---|---|
| VALID | Signature OK, in window, unused, not cancelled → check-in recorded |
| TOO EARLY | Valid but before allowed entry window |
| EXPIRED | Booking window ended |
| INVALID | Forged, unknown, already used or cancelled |

---

## 6. Data Model (Supabase / Postgres)

| Table | Key columns |
|---|---|
| `profiles` | `id` (= auth.users.id), `full_name`, `email`, `role`, `created_at` |
| `floors` | `id`, `name`, `level` |
| `seats` | `id`, `floor_id`, `section`, `table_no`, `seat_no`, `x`, `y`, `is_blocked`, `block_reason` |
| `bookings` | `id`, `user_id`, `seat_id`, `start_at`, `end_at`, `status` (`booked`, `checked_in`, `completed`, `cancelled`, `no_show`), `entry_code_hash`, `token_sig`, `used_at`, `checked_in_at`, `checked_out_at`, `group_id` |
| `booking_groups` | `id`, `owner_id`, `name`, `room_id` |
| `group_invites` | `id`, `group_id`, `email`, `status` |
| `favourite_seats` | `user_id`, `seat_id` |
| `books` | `id`, `title`, `author`, `isbn`, `category`, `cover_url`, `status` |
| `book_issues` | `id`, `book_id`, `user_id`, `issued_at`, `pickup_code_hash`, `picked_up_at`, `due_at`, `returned_at`, `status` |
| `settings` | `id`, `open_time`, `close_time`, `max_bookings_per_day`, `max_hours_per_day`, `early_entry_min`, `no_show_min`, `book_limit` |
| `holidays` | `id`, `date`, `label` |
| `announcements` | `id`, `message`, `active`, `created_by` |
| `occupancy_snapshots` | `id`, `floor_id`, `taken_at`, `occupied_count` |

**Constraints/indexes:** exclusion constraint on `(seat_id, tstzrange(start_at, end_at))` for active bookings to block double-booking at the DB level; indexes on `bookings(user_id, start_at)` and `bookings(seat_id, start_at)`.

**RLS:** students read/write only their own bookings, favourites and issues; seats, books, floors and settings are readable by authenticated users; writes to settings, books, blocks and gate actions require admin.

---

## 7. Key User Flows

**Book a seat:** Login → Book page → pick floor/section on map → choose date/time/duration (live preview updates) → summary + validation → confirm → pass shown + email sent.

**Enter library:** Student opens QR (email or My Reservations) → admin scans at Gate Check (or types 6-digit code) → VALID → check-in recorded → code locked.

**Issue a book:** Catalogue → select available book → Issue → receive code → show at desk → admin confirms → book marked borrowed.

**No-show:** Cron runs every minute → bookings not checked in 15 min after start → `no_show`, seat freed.

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Seat map loads < 2 s on 4G; booking API < 500 ms p95 |
| Freshness | Occupancy refresh every 2 min (polling; Supabase Realtime optional) |
| Security | HTTPS, JWT verification, RLS, server-side HMAC, rate-limit gate and auth endpoints, service-role key server-only |
| Reliability | Booking creation is transactional; cron jobs idempotent |
| Accessibility | Keyboard navigable, sufficient contrast in both themes, labelled controls |
| Compatibility | Latest Chrome, Edge, Safari, Firefox; Android/iOS PWA |
| Privacy | Store only name, email and activity needed; no secrets in client |
| Time zone | All timestamps stored UTC, displayed in library time zone |

---

## 9. Success Metrics
- ≥ 90% of bookings complete in < 60 s
- No-show rate trending down after reminders
- 0 successful reuse of an entry code
- Gate verification < 1 s
- ≥ 80% of book issues done online

---

## 10. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Gmail SMTP limits (~500/day) | Queue emails, retry; switch to Resend/SendGrid if volume grows |
| Race conditions on booking | DB exclusion constraint + transactions |
| Camera scanner issues on iOS | Manual 6-digit fallback |
| Free-tier Supabase pause / free host sleep | Keep-alive ping; note cold starts for cron host |
| Forged codes | Server-side HMAC, secret rotation plan |

---

## 11. Milestones
| Phase | Scope |
|---|---|
| M1 | Setup, Supabase schema, auth, role guards |
| M2 | Seat map, booking flow, validation, My Reservations |
| M3 | Email, QR, signed codes, Gate Check, single-use |
| M4 | Dashboards, books, admin tools, cron jobs |
| M5 | Advanced (groups, favourites, extend/move, calendar), analytics, export |
| M6 | UI polish, 3D hero, dark mode, PWA, testing, deploy |

---

## 12. Assumptions & Open Questions
- **Assumed:** "can take only book" = **one book at a time** per student; change via `settings.book_limit`.
- **Assumed:** books are issued online, then physically handed over at the desk and confirmed by admin.
- Admin accounts are created by promoting a user in `profiles` (no public admin sign-up).
- Allowed email domain: open Gmail, or restricted to college addresses? *(to decide)*
- Loan period for books and any overdue handling? *(to decide)*
- Group rooms: capacity limits and whether invitees must accept before the slot is held? *(to decide)*
