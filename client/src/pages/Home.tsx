import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { BookLogo } from '../components/BookLogo';
import { Hero3D } from '../components/Hero3D';
import { InstallPrompt } from '../components/InstallPrompt';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiFetchCached, getApiCache } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import type { Announcement, Book } from '../types';

interface PublicSummary {
  announcements: Announcement[];
  featuredBooks: Book[];
  floors?: Array<{ level: number; name: string; total: number; available: number }>;
  totalBooks?: number;
  liveStats?: { totalSeats: number; availableNow: number; occupiedNow: number };
}

export function Home() {
  const { user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [summary, setSummary] = useState<PublicSummary | null>(
    () => getApiCache<PublicSummary>('/api/dashboard/public') ?? null,
  );

  const loadSummary = (force = false) => {
    apiFetchCached<PublicSummary>('/api/dashboard/public', {
      skipAuth: true,
      maxAgeMs: 30_000,
      force,
    })
      .then(setSummary)
      .catch(() => {
        // Fallback marquee & books render gracefully
      });
  };

  useEffect(() => {
    loadSummary(false);
  }, []);

  useRealtime(['bookings', 'seats', 'books', 'announcements'], () => {
    loadSummary(true);
  });

  const seatsTarget = user ? (role === 'admin' ? '/admin' : '/book') : '/login';
  const portalTarget = user ? (role === 'admin' ? '/admin' : '/dashboard') : '/login';

  const f1 = summary?.floors?.find((f) => f.level === 1);
  const f2 = summary?.floors?.find((f) => f.level === 2);
  const f3 = summary?.floors?.find((f) => f.level === 3);

  const marqueeItems = [
    `FLOOR 1 · ${f1 ? `${f1.available} FREE` : '21 DESKS OPEN'}`,
    `FLOOR 2 · ${f2 ? `${f2.available} FREE` : '21 QUIET CARRELS'}`,
    `FLOOR 3 · ${f3 ? `${f3.available} FREE · QUIET ZONE OPEN` : 'RESEARCH & GROUP SUITES OPEN'}`,
    `ARCHIVE · ${summary?.totalBooks ? `${summary.totalBooks} CURATED VOLUMES` : 'ONLINE CIRCULATION'}`,
    'SIGNED QR GATE ENTRY · SINGLE-USE HMAC',
    'OPEN DAILY 08:00 – 22:00 · NO-SHOW RELEASE 15 MIN',
  ];

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col justify-between">
      <AnnouncementBanner announcements={summary?.announcements ?? []} />

      {/* Minimalist Architectural Header */}
      <header className="w-full shrink-0 z-40 border-b border-[var(--border-color)] bg-[var(--bg-primary)]/90 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <BookLogo className="w-8 h-7" />
            <span className="font-bold tracking-[0.14em] text-xs sm:text-sm uppercase">
              STUDYDOCK
              <span className="hidden md:inline opacity-60 font-normal ml-2">
                // LIBRARY ARCHIVE
              </span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 text-xs font-bold tracking-[0.16em] uppercase">
            <Link
              to={seatsTarget}
              className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
            >
              01. SEATS
            </Link>
            <Link
              to="/books"
              className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
            >
              02. CATALOG
            </Link>
            <Link
              to={portalTarget}
              className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
            >
              {user ? (role === 'admin' ? '03. ADMIN CONSOLE' : '03. DASHBOARD') : '03. SIGN IN & PASS'}
            </Link>
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="btn-slide p-2.5"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <Link
              to={seatsTarget}
              className="btn-slide btn-slide-solid px-4 sm:px-5 py-2 text-[11px] sm:text-xs"
            >
              {user && role === 'admin' ? 'ADMIN PANEL' : 'RESERVE DESK'}
            </Link>
          </div>
        </div>
      </header>

      {/* 100vh Hero Centerpiece */}
      <main className="flex-1 min-h-0 flex flex-col justify-between w-full overflow-hidden">
        <section className="flex-1 min-h-0 w-full max-w-[1440px] mx-auto px-4 sm:px-8 pt-4 sm:pt-6 pb-4 sm:pb-6 flex flex-col justify-between overflow-hidden">
          {/* Centerpiece: Giant Stacked Poster Headline + Overlapping Diagonal 3D Book Stack */}
          <div className="relative my-auto py-2 sm:py-3 select-none">
            <h1 className="font-poster hero-headline w-full relative z-10 pointer-events-none">
              <span className="line-mask">
                <span className="line-reveal line-reveal-delay-1 block w-full">BOOK A SEAT.</span>
              </span>
              <span className="line-mask">
                <span className="line-reveal line-reveal-delay-2 block w-full">
                  BORROW A STORY.
                </span>
              </span>
            </h1>

            <Hero3D featuredBooks={summary?.featuredBooks ?? []} />
          </div>

          {/* Bottom Editorial Sub-Bar & Quick Actions */}
          <div className="shrink-0 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 pt-4 sm:pt-5 border-t border-[var(--border-color)] items-end relative z-30">
            <div className="lg:col-span-6">
              <p className="text-sm sm:text-base md:text-lg font-medium leading-snug max-w-lg">
                Three architectural floors of acoustic oak desks, curated academic monographs, and
                instant HMAC-signed QR entry passes.
              </p>
            </div>

            <div className="lg:col-span-6 flex flex-wrap items-center lg:justify-end gap-3 sm:gap-4">
              <Link
                to={seatsTarget}
                className="btn-slide btn-slide-solid px-5 sm:px-6 py-3 text-xs"
              >
                <span>{user && role === 'admin' ? 'OPEN ADMIN CONSOLE' : 'CLAIM A READING DESK'}</span>
                <span>→</span>
              </Link>
              <Link to="/books" className="btn-slide px-5 sm:px-6 py-3 text-xs">
                <span>EXPLORE 5 FEATURED VOLUMES</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Infinite Marquee Strip Flush at Bottom of 100vh Viewport */}
        <section aria-label="Live Library Floor Status" className="marquee-band shrink-0 py-3 sm:py-3.5">
          <div className="marquee-track">
            {[0, 1].map((dup) => (
              <div
                key={dup}
                aria-hidden={dup === 1}
                className="flex items-center gap-8 sm:gap-12 px-4 sm:px-6 text-[11px] sm:text-xs md:text-sm font-bold tracking-[0.18em] uppercase whitespace-nowrap"
              >
                {marqueeItems.map((item) => (
                  <span key={`${dup}-${item}`} className="inline-flex items-center gap-8 sm:gap-12">
                    <span className="inline-flex items-center gap-2.5">
                      <span className="w-2 h-2 bg-current inline-block" />
                      {item}
                    </span>
                    <span className="opacity-45">//</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      <InstallPrompt />
    </div>
  );
}
