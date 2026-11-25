import {
  Bell,
  CalendarOff,
  CheckCircle2,
  Lock,
  Save,
  Settings,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch, apiFetchCached, getApiCache } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import type { Announcement, Floor, Holiday, LibrarySettings, Seat } from '../../types';

export function AdminSettings() {
  const cachedSettings = getApiCache<{ settings: LibrarySettings; holidays: Holiday[] }>(
    '/api/admin/settings',
  );
  const cachedAnn = getApiCache<{ announcements: Announcement[] }>('/api/admin/announcements');
  const cachedSeats = getApiCache<{ floors: Floor[]; seats: Seat[] }>('/api/seats');

  const [settings, setSettings] = useState<LibrarySettings | null>(
    cachedSettings?.settings ?? null,
  );
  const [holidays, setHolidays] = useState<Holiday[]>(cachedSettings?.holidays ?? []);
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    cachedAnn?.announcements ?? [],
  );
  const [floors, setFloors] = useState<Floor[]>(cachedSeats?.floors ?? []);
  const [seats, setSeats] = useState<Seat[]>(cachedSeats?.seats ?? []);
  const [pendingSeatIds, setPendingSeatIds] = useState<Set<string>>(new Set());

  const [holidayDate, setHolidayDate] = useState('');
  const [holidayLabel, setHolidayLabel] = useState('');
  const [bannerText, setBannerText] = useState('');
  const [bannerLevel, setBannerLevel] = useState<'info' | 'warning' | 'urgent'>('info');
  const [blockReason, setBlockReason] = useState('Electrical maintenance');
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async (force = false) => {
    const [sRes, aRes, seatRes] = await Promise.all([
      apiFetchCached<{ settings: LibrarySettings; holidays: Holiday[] }>('/api/admin/settings', {
        maxAgeMs: 20_000,
        force,
      }),
      apiFetchCached<{ announcements: Announcement[] }>('/api/admin/announcements', {
        maxAgeMs: 20_000,
        force,
      }),
      apiFetchCached<{ floors: Floor[]; seats: Seat[] }>('/api/seats', {
        maxAgeMs: 20_000,
        force,
      }),
    ]);
    setSettings(sRes.settings);
    setHolidays(sRes.holidays);
    setAnnouncements(aRes.announcements);
    setFloors(seatRes.floors);
    setSeats(seatRes.seats);
  }, []);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  useRealtime(['seats', 'announcements', 'settings'], () => {
    void loadAll(true);
  });

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        open_time: settings.open_time.slice(0, 5),
        close_time: settings.close_time.slice(0, 5),
        max_bookings_per_day: Number(settings.max_bookings_per_day),
        max_hours_per_day: Number(settings.max_hours_per_day),
        early_entry_min: Number(settings.early_entry_min),
        no_show_min: Number(settings.no_show_min),
        book_limit: Number(settings.book_limit),
        book_pickup_hours: Number(settings.book_pickup_hours),
        book_loan_days: Number(settings.book_loan_days),
        allowed_email_domain: settings.allowed_email_domain || '',
      }),
    });
    setNotice('Library rules & schedule updated.');
  };

  const handleAddHoliday = async (e: FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: holidayDate, label: holidayLabel }),
    });
    setHolidayDate('');
    setHolidayLabel('');
    await loadAll(true);
  };

  const handleCreateAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ message: bannerText, level: bannerLevel, active: true }),
    });
    setBannerText('');
    setNotice('Announcement published live to the top header banner & student dashboard.');
    await loadAll(true);
    window.dispatchEvent(new Event('announcements-updated'));
  };

  const handleToggleSeatBlock = async (seat: Seat) => {
    if (pendingSeatIds.has(seat.id)) return;
    const nextBlocked = !seat.is_blocked;

    // 0ms optimistic UI update — flips color & lock icon immediately on click
    setSeats((prev) =>
      prev.map((s) =>
        s.id === seat.id
          ? {
              ...s,
              is_blocked: nextBlocked,
              block_reason: nextBlocked ? blockReason : null,
              status: nextBlocked ? 'blocked' : 'available',
            }
          : s,
      ),
    );
    setPendingSeatIds((prev) => new Set(prev).add(seat.id));

    try {
      const res = await apiFetch<{ cancelledBookings: number }>('/api/admin/blocks', {
        method: 'POST',
        body: JSON.stringify({
          seatId: seat.id,
          isBlocked: nextBlocked,
          reason: blockReason,
        }),
      });
      setNotice(
        nextBlocked
          ? `Blocked ${seat.label} (${res.cancelledBookings} booking(s) cancelled & notified).`
          : `Unblocked ${seat.label}.`,
      );
    } catch {
      // Revert only if the server request failed
      setSeats((prev) =>
        prev.map((s) =>
          s.id === seat.id
            ? {
                ...s,
                is_blocked: seat.is_blocked,
                block_reason: seat.block_reason,
                status: seat.status,
              }
            : s,
        ),
      );
      setNotice(`Failed to update ${seat.label}. Please try again.`);
    } finally {
      setPendingSeatIds((prev) => {
        const next = new Set(prev);
        next.delete(seat.id);
        return next;
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="pb-5 border-b border-[var(--border-color)]">
          <div className="meta-label">// 05. OPERATING RULES, HOLIDAYS &amp; MAINTENANCE</div>
          <h1 className="font-poster text-4xl sm:text-5xl mt-1 flex items-center gap-3">
            <Settings className="h-8 w-8" /> SETTINGS &amp; BLOCKS
          </h1>
        </div>

        {notice && (
          <div className="p-3.5 border border-emerald-400/70 bg-emerald-500/15 text-xs sm:text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
          </div>
        )}

        {settings && (
          <form
            onSubmit={handleSaveSettings}
            className="editorial-card p-6 space-y-5 border-[var(--border-strong)]"
          >
            <h2 className="font-poster text-2xl border-b border-[var(--border-color)] pb-2">
              HALL HOURS &amp; BOOKING RULES
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="space-y-1.5">
                <span className="meta-label block">OPEN TIME</span>
                <input
                  type="time"
                  value={settings.open_time.slice(0, 5)}
                  onChange={(e) => setSettings({ ...settings, open_time: e.target.value })}
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">CLOSE TIME</span>
                <input
                  type="time"
                  value={settings.close_time.slice(0, 5)}
                  onChange={(e) => setSettings({ ...settings, close_time: e.target.value })}
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">MAX BOOKINGS / DAY</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.max_bookings_per_day}
                  onChange={(e) =>
                    setSettings({ ...settings, max_bookings_per_day: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">MAX HOURS / DAY</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={settings.max_hours_per_day}
                  onChange={(e) =>
                    setSettings({ ...settings, max_hours_per_day: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">EARLY ENTRY (MIN)</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.early_entry_min}
                  onChange={(e) =>
                    setSettings({ ...settings, early_entry_min: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">NO-SHOW TIMEOUT (MIN)</span>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={settings.no_show_min}
                  onChange={(e) =>
                    setSettings({ ...settings, no_show_min: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">BOOK LIMIT / READER</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.book_limit}
                  onChange={(e) =>
                    setSettings({ ...settings, book_limit: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
              <label className="space-y-1.5">
                <span className="meta-label block">PICKUP HOLD (HRS)</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settings.book_pickup_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, book_pickup_hours: Number(e.target.value) })
                  }
                  className="editorial-input font-mono"
                />
              </label>
            </div>
            <button type="submit" className="btn-slide btn-slide-solid px-6 py-3 text-xs">
              <Save className="h-4 w-4" /> SAVE CONFIGURATION →
            </button>
          </form>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="editorial-card p-6 space-y-4">
            <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <CalendarOff className="h-5 w-5" /> HOLIDAY SCHEDULE
            </h2>
            <form onSubmit={handleAddHoliday} className="flex flex-wrap gap-2">
              <input
                type="date"
                required
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="editorial-input w-40 font-mono text-xs"
              />
              <input
                type="text"
                required
                value={holidayLabel}
                onChange={(e) => setHolidayLabel(e.target.value)}
                placeholder="Holiday label"
                className="editorial-input flex-1 text-xs"
              />
              <button type="submit" className="btn-slide btn-slide-solid px-4 py-2 text-xs">
                ADD
              </button>
            </form>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {holidays.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2.5 border border-[var(--border-color)] bg-[var(--bg-primary)] text-xs"
                >
                  <span>
                    <strong className="font-mono">{h.date}</strong> // {h.label}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/holidays/${h.id}`, { method: 'DELETE' });
                      await loadAll(true);
                    }}
                    className="p-1 text-rose-300 hover:text-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="editorial-card p-6 space-y-4">
            <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <Bell className="h-5 w-5" /> READER ANNOUNCEMENTS
            </h2>
            <form onSubmit={handleCreateAnnouncement} className="space-y-2.5">
              <textarea
                rows={2}
                required
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="Broadcast notice across student portal & landing header…"
                className="editorial-input text-xs"
              />
              <div className="flex items-center gap-2">
                <select
                  value={bannerLevel}
                  onChange={(e) => setBannerLevel(e.target.value as 'info' | 'warning' | 'urgent')}
                  className="editorial-input w-44 text-xs uppercase font-bold"
                >
                  <option value="info">INFO BANNER</option>
                  <option value="warning">WARNING BANNER</option>
                  <option value="urgent">URGENT ALERT</option>
                </select>
                <button type="submit" className="btn-slide btn-slide-solid px-4 py-2.5 text-xs">
                  PUBLISH →
                </button>
              </div>
            </form>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 p-2.5 border border-[var(--border-color)] bg-[var(--bg-primary)] text-xs"
                >
                  <span className={a.active ? '' : 'line-through opacity-50'}>{a.message}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/announcements/${a.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ active: !a.active }),
                        });
                        await loadAll(true);
                        window.dispatchEvent(new Event('announcements-updated'));
                      }}
                      className="text-[10px] font-bold uppercase tracking-wider underline"
                    >
                      {a.active ? 'HIDE' : 'SHOW'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' });
                        await loadAll(true);
                        window.dispatchEvent(new Event('announcements-updated'));
                      }}
                      className="text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Maintenance Seat Blocker */}
        <div className="editorial-card p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
            <div>
              <h2 className="font-poster text-2xl">MAINTENANCE DESK BLOCKS</h2>
              <p className="text-xs opacity-75">
                Click any desk to toggle maintenance block. Blocking cancels active bookings and
                notifies readers.
              </p>
            </div>
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Maintenance reason"
              className="editorial-input text-xs sm:w-64"
            />
          </div>

          <div className="space-y-4">
            {floors.map((f) => (
              <div key={f.id} className="space-y-2">
                <div className="meta-label">
                  FLOOR 0{f.level} — {f.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {seats
                    .filter((s) => s.floor_id === f.id)
                    .map((seat) => (
                      <button
                        key={seat.id}
                        type="button"
                        onClick={() => void handleToggleSeatBlock(seat)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-bold inline-flex items-center gap-1.5 border transition-colors ${
                          seat.is_blocked
                            ? 'bg-rose-700 text-[#F0EDE5] border-rose-300'
                            : 'bg-[var(--bg-primary)] border-[var(--border-color)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        {seat.is_blocked ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <Unlock className="h-3 w-3 opacity-50" />
                        )}
                        {seat.label}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
