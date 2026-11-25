# 📚 Library Management System

A full-stack web app for a college library: students **book seats** on an interactive 3-floor map, **issue books** through the website, and **enter the library with a signed QR / 6-digit code**. Admins manage occupancy, check-ins, bookings, books and settings from a dedicated dashboard.

---

## ✨ Features

### Accounts & security
- Student and admin sign-in with Gmail (Supabase Auth, Google OAuth) plus email/password
- Password reset via Supabase email flow
- Role-protected routes: students can't open admin pages and vice versa (enforced in the UI, API and Supabase Row Level Security)
- Hosted Supabase Postgres: all data lives on the server, never in the browser

### Seat booking
- Interactive 3-floor seat map with zoom, section filters and table/seat search
- Live seat status: **available / reserved / occupied**
- Date (up to 7 days ahead), start time, duration 30 min – 8 hours
- Live floor-plan preview beside the booking form
- Booking summary with validation: closing time, past times, double-booking
- My Reservations (upcoming, current, previous) with cancel, extend and move
- Per-student booking limits (e.g. daily maximum)
- Favourite seats with one-tap booking
- Group / discussion-room booking with invites

### Confirmation & entry
- Confirmation email with seat details, **QR code** and a unique **6-digit code**
- HMAC-signed entry code tied to seat, date and time (can't be forged)
- Single-use codes; cancelled bookings are rejected at the gate
- **Gate Check** page with camera QR scanner or manual code entry → `VALID`, `TOO EARLY`, `EXPIRED`, `INVALID`
- Reminder email before the booking starts
- Add to calendar (Google Calendar link or `.ics`)

### Library books
- Book catalogue with search and borrowed status (linked from the hero books)
- Books can be issued **only through the website**; a student can hold **one book at a time** (configurable)
- Pickup at the desk is verified with the issue code

### Dashboards
- **Student:** occupancy ring, stat cards, floor-wise availability, upcoming bookings, busy-time chart ("usually quiet at 2 PM")
- **Admin:** stats, floor occupancy, reservations table (filters, time left), live check-in/out and "who is inside now", auto-release of no-shows after 15 min, analytics (peak hours, busiest floors, no-show rate), Excel export, settings (hours, holidays, booking rules), block seats/tables for maintenance, announcement banner, filter tabs (All / Upcoming / Booked / Checked in), refresh button, QR scanner + manual code entry

### Design & experience
- Responsive layout with smooth animations
- Cinematic 3D book hero as the public home page
- Light and Dark mode
- Installable PWA
- Occupancy data refreshes every 2 minutes; sample bookings reset daily

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript |
| Styling / animation | Tailwind CSS, Framer Motion, Lucide icons |
| Routing | React Router |
| Backend | Node.js + Express |
| Database & Auth | Supabase (Postgres, Auth, RLS) |
| Email | Nodemailer (Gmail SMTP) |
| Charts | Recharts |
| Excel export | exceljs |
| Scheduled jobs | node-cron |
| Mobile | PWA |

---

## 🗂️ Project Structure

```
library-management/
├── client/                     # Vite + React + TS
│   ├── public/                 # manifest.webmanifest, icons, service worker
│   └── src/
│       ├── components/         # SeatMap, FloorPreview, QRScanner, Hero3D, ...
│       ├── pages/              # Home, Login, Dashboard, Book, Reservations, Books,
│       │   └── admin/          # AdminDashboard, GateCheck, Analytics, Settings, ...
│       ├── hooks/              # useAuth, useSeats, useTheme
│       ├── lib/                # supabaseClient, api, utils
│       ├── routes/             # ProtectedRoute, RoleRoute
│       └── main.tsx
├── server/                     # Node + Express
│   └── src/
│       ├── routes/             # bookings, seats, books, gate, admin
│       ├── services/           # email, qr/signing, validation, export
│       ├── jobs/               # noShowRelease, reminders, dailyReset, occupancy
│       ├── middleware/         # verifySupabaseJWT, requireRole
│       └── index.ts
├── supabase/
│   ├── migrations/             # schema + RLS policies
│   └── seed.sql                # floors, seats, sample books
├── docs/
│   ├── PRD.md
│   └── tasks.md
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project
- A Gmail account with an **App Password** (2-Step Verification enabled)
- Antigravity IDE (or any editor)

### 1. Clone and install
```bash
git clone <your-repo-url> library-management
cd library-management
npm install --prefix client
npm install --prefix server
```

### 2. Supabase setup
1. Create a new project in Supabase.
2. **Authentication → Providers:** enable **Email** and **Google** (add your Google OAuth client ID/secret).
3. **Authentication → URL Configuration:** set Site URL to `http://localhost:5173` and add redirect URLs for production and `/reset-password`.
4. Run the SQL in `supabase/migrations/` (SQL Editor or `supabase db push`), then `supabase/seed.sql`.
5. Set admin users by updating their row in `profiles` (`role = 'admin'`).

### 3. Environment variables

**`client/.env`**
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:4000
```

**`server/.env`**
```env
PORT=4000
CLIENT_URL=http://localhost:5173

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only, never expose

GMAIL_USER=yourlibrary@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

ENTRY_CODE_SECRET=long-random-string               # HMAC key for signed QR
TZ=Asia/Kolkata
```

### 4. Run
```bash
# terminal 1
cd server && npm run dev

# terminal 2
cd client && npm run dev
```
Client: http://localhost:5173 · API: http://localhost:4000

---

## 🔐 How Entry Codes Work

1. A booking is created → server generates a random **6-digit code** (stored hashed) and a **signed token**:
   `payload = bookingId.seatId.start.end` → `signature = HMAC-SHA256(payload, ENTRY_CODE_SECRET)`
2. The QR encodes `payload.signature`; the email carries the QR image and the 6-digit code.
3. At the gate, the scanner (or manual code) calls `POST /api/gate/verify`.
4. The server checks signature, booking status, time window, and `used_at IS NULL`, then marks it used **atomically**.
5. Result: `VALID`, `TOO EARLY`, `EXPIRED` or `INVALID` (cancelled / already used / forged).

---

## 🕒 Scheduled Jobs (node-cron)

| Job | Schedule | Purpose |
|---|---|---|
| No-show release | every minute | Release bookings not checked in within 15 min of start |
| Reminder emails | every 5 min | Email students shortly before booking starts |
| Occupancy snapshot | every 2 min | Refresh occupancy data for charts/dashboards |
| Daily reset | 00:00 | Reset sample bookings, expire stale holds |

---

## 🌐 API Overview

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/seats?floor=&date=` | student | Seat map with live status |
| POST | `/api/bookings` | student | Create booking (validated) |
| PATCH | `/api/bookings/:id` | student | Extend / move |
| DELETE | `/api/bookings/:id` | student | Cancel |
| GET | `/api/bookings/mine` | student | My reservations |
| POST | `/api/books/:id/issue` | student | Issue a book |
| POST | `/api/gate/verify` | admin | Verify QR / 6-digit code |
| GET | `/api/admin/reservations` | admin | Filterable reservations |
| GET | `/api/admin/analytics` | admin | Peak hours, busiest floors, no-show rate |
| GET | `/api/admin/export` | admin | Excel export |
| PUT | `/api/admin/settings` | admin | Hours, holidays, rules |
| POST | `/api/admin/blocks` | admin | Block seat/table |

---

## 📱 PWA

The client ships a web manifest and service worker. On a phone, open the site and choose **Add to Home Screen**.

---

## ☁️ Deployment

- **Client:** Vercel / Netlify (`npm run build` → `dist/`)
- **Server:** Render / Railway / Fly.io (needs a long-running process for `node-cron`)
- **Database:** Supabase (already hosted)
- Set all environment variables on the host and update Supabase redirect URLs.

---

## 🧪 Scripts

| Command | Where | Description |
|---|---|---|
| `npm run dev` | client / server | Start dev server |
| `npm run build` | client / server | Production build |
| `npm run lint` | client / server | Lint |
| `npm test` | server | Run tests |

---

## 🗺️ Roadmap
See [`docs/PRD.md`](docs/PRD.md) for requirements and [`docs/tasks.md`](docs/tasks.md) for the build checklist.

## 📄 License
MIT
