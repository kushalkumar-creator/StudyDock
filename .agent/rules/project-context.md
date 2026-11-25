# Library Management System — Workspace Rules & Context

## Architecture
- **Frontend (`client/`)**: Vite + React 18 + TypeScript + Tailwind CSS + Framer Motion + Recharts + Lucide icons + React Router.
- **Backend (`server/`)**: Node.js + Express + TypeScript + Zod + Nodemailer + QRCode + ExcelJS + node-cron.
- **Database & Auth (`supabase/`)**: Hosted Supabase Postgres with Row Level Security (RLS), Supabase Auth (Google OAuth + Email/Password).

## Core Invariants & Security Rules
1. **No authoritative state in browser storage**: Only UI preferences (theme, install dismissal) live in `localStorage`. All bookings, seats, books, profiles, settings, and entry logs live in Supabase.
2. **Three-layer RBAC**: Enforce `student` vs `admin` roles in React route guards (`ProtectedRoute` / `RoleRoute`), Express middleware (`verifySupabaseJWT` + `requireRole`), and Supabase RLS policies.
3. **Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ENTRY_CODE_SECRET` to the client**.
4. **Signed single-use entry codes**: Entry tokens use `base64url(bookingId.seatId.startISO.endISO).HMAC-SHA256`, 6-digit codes are stored hashed (SHA-256 with secret pepper), and `POST /api/gate/verify` marks `used_at` atomically.
5. **Double-booking prevention**: Enforced both in Express validation and via a Postgres `EXCLUDE USING gist` constraint on `(seat_id, tstzrange(start_at, end_at))` for active bookings.
6. **Timezones**: Store all timestamps in UTC (`timestamptz`) and format/validate library open hours in the configured library timezone (`TZ`, default `Asia/Kolkata`).
7. **Deployment readiness**: Server binds to `0.0.0.0` on `process.env.PORT || 4000` with `GET /api/health` for Render; client builds to `client/dist` with SPA rewrite for Netlify.
