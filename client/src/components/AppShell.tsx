import {
  BarChart3,
  BookOpen,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  QrCode,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiFetchCached, getApiCache } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import type { Announcement } from '../types';
import { AnnouncementBanner } from './AnnouncementBanner';
import { BookLogo } from './BookLogo';
import { InstallPrompt } from './InstallPrompt';

interface NavItem {
  num: string;
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const studentNav: NavItem[] = [
  { num: '01', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { num: '02', to: '/book', label: 'Book a Seat', icon: MapPin },
  { num: '03', to: '/reservations', label: 'Reservations', icon: CalendarClock },
  { num: '04', to: '/books', label: 'Book Catalog', icon: BookOpen },
];

const adminNav: NavItem[] = [
  { num: '01', to: '/admin', label: 'Operations', icon: LayoutDashboard },
  { num: '02', to: '/admin/gate', label: 'Gate Check', icon: QrCode },
  { num: '03', to: '/admin/books', label: 'Circulation', icon: BookOpen },
  { num: '04', to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { num: '05', to: '/admin/settings', label: 'Settings & Blocks', icon: Settings },
];

export function AppShell({
  children,
  showSidebar = true,
}: {
  children: ReactNode;
  showSidebar?: boolean;
}) {
  const { user, profile, role, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    () => getApiCache<{ announcements: Announcement[] }>('/api/dashboard/public')?.announcements ?? [],
  );

  useEffect(() => {
    const refreshBanner = (force = false) => {
      apiFetchCached<{ announcements: Announcement[] }>('/api/dashboard/public', {
        skipAuth: true,
        maxAgeMs: 60_000,
        force,
      })
        .then((res) => setAnnouncements(res.announcements ?? []))
        .catch(() => {
          // Ignore when offline
        });
    };

    refreshBanner(false);
    const onUpdated = () => refreshBanner(true);
    window.addEventListener('announcements-updated', onUpdated);
    return () => window.removeEventListener('announcements-updated', onUpdated);
  }, []);

  useRealtime(['announcements'], () => {
    apiFetchCached<{ announcements: Announcement[] }>('/api/dashboard/public', {
      skipAuth: true,
      force: true,
    })
      .then((res) => setAnnouncements(res.announcements ?? []))
      .catch(() => {
        // Ignore
      });
  });

  const navItems = role === 'admin' ? adminNav : user ? studentNav : [];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AnnouncementBanner announcements={announcements} />

      {/* Minimalist Architectural Header */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--border-color)] bg-[var(--bg-primary)]/95 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {showSidebar && navItems.length > 0 && (
              <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle navigation menu"
                className="lg:hidden btn-slide p-2"
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            )}

            <Link to="/" className="flex items-center gap-3 group">
              <BookLogo className="w-8 h-7" />
              <span className="font-bold tracking-[0.14em] text-xs sm:text-sm uppercase">
                STUDYDOCK
                <span className="hidden md:inline opacity-60 font-normal ml-2">
                  // LIBRARY ARCHIVE
                </span>
              </span>
            </Link>
          </div>

          {!user && (
            <nav className="hidden lg:flex items-center gap-8 text-xs font-bold tracking-[0.16em] uppercase">
              <Link
                to="/"
                className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
              >
                00. POSTER
              </Link>
              <Link
                to="/books"
                className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
              >
                01. CATALOG
              </Link>
              <Link
                to="/login"
                className="hover:opacity-65 transition-opacity py-1 border-b border-transparent hover:border-current"
              >
                02. SIGN IN
              </Link>
            </nav>
          )}

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

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold tracking-[0.08em] uppercase leading-tight">
                    {profile?.full_name || user.email?.split('@')[0]}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.16em] uppercase opacity-70">
                    {role === 'admin' && <ShieldCheck className="h-3 w-3" />}
                    {role || 'student'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="btn-slide px-3 py-2 text-[11px] sm:text-xs"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">SIGN OUT</span>
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-slide btn-slide-solid px-4 sm:px-5 py-2 text-xs">
                SIGN IN
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area with Sharp Architectural Sidebar */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {showSidebar && navItems.length > 0 && (
          <>
            <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-[var(--border-color)] py-6 px-4 gap-1.5">
              <div className="px-3 pb-3 mb-2 border-b border-[var(--border-color)] text-[10px] font-bold uppercase tracking-[0.2em] opacity-65">
                {role === 'admin' ? '// ADMIN CONTROL' : '// STUDENT ARCHIVE'}
              </div>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin' || item.to === '/dashboard'}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-3 text-xs font-bold tracking-[0.14em] uppercase border transition-all ${
                        isActive
                          ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                          : 'border-transparent hover:border-[var(--border-strong)] hover:bg-[var(--card-bg)]'
                      }`
                    }
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>
                    <span className="opacity-55 font-mono text-[10px]">{item.num}</span>
                  </NavLink>
                );
              })}
            </aside>

            {mobileOpen && (
              <div className="fixed inset-0 z-50 lg:hidden flex">
                <div
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm"
                  onClick={() => setMobileOpen(false)}
                />
                <aside className="relative z-10 w-72 max-w-[85vw] bg-[var(--bg-primary)] border-r border-[var(--border-strong)] h-full p-5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between pb-4 mb-3 border-b border-[var(--border-color)]">
                    <span className="font-bold tracking-[0.14em] text-xs uppercase">
                      STUDYDOCK
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileOpen(false)}
                      className="btn-slide p-1.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/admin' || item.to === '/dashboard'}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3.5 py-3 text-xs font-bold tracking-[0.14em] uppercase border ${
                            isActive
                              ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                              : 'border-transparent hover:border-[var(--border-color)]'
                          }`
                        }
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </span>
                        <span className="opacity-55 font-mono text-[10px]">{item.num}</span>
                      </NavLink>
                    );
                  })}
                </aside>
              </div>
            )}
          </>
        )}

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-7">{children}</main>
      </div>

      {/* Editorial Footer */}
      <footer className="border-t border-[var(--border-color)] py-5 px-4 sm:px-8 text-[11px] font-semibold tracking-[0.14em] uppercase opacity-75">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © {new Date().getFullYear()} STUDYDOCK // SMART LIBRARY &amp; READING ROOM
          </span>
          <div className="flex items-center gap-6">
            <Link to="/books" className="hover:opacity-65">
              CATALOG
            </Link>
            <Link to="/login" className="hover:opacity-65">
              PORTAL
            </Link>
          </div>
        </div>
      </footer>

      <InstallPrompt />
    </div>
  );
}
