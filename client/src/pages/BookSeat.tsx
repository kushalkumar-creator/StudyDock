import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { EntryPassModal } from '../components/EntryPassModal';
import { SeatMap } from '../components/SeatMap';
import { ApiError, apiFetch, apiFetchCached, getApiCache } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import type { BookingRecord, EntryPass, Floor, Seat } from '../types';

function toLocalDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getNextHalfHourTime(): string {
  const now = new Date();
  const mins = now.getMinutes();
  const next = new Date(now);
  if (mins < 30) next.setMinutes(30, 0, 0);
  else next.setHours(next.getHours() + 1, 0, 0, 0);
  const h = Math.max(8, Math.min(21, next.getHours()));
  const m = next.getHours() < 8 ? 0 : next.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const START_TIMES = Array.from({ length: 28 }, (_, i) => {
  const totalMin = 8 * 60 + i * 30;
  const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const m = String(totalMin % 60).padStart(2, '0');
  return `${h}:${m}`;
});

const DURATIONS_MIN = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);

export function getDefaultBookingWindow() {
  const today = new Date();
  const dateStr = toLocalDateInput(today);
  const startTime = getNextHalfHourTime();
  const start = new Date(`${dateStr}T${startTime}:00`);
  const end = new Date(start.getTime() + 120 * 60_000);
  const qs = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
  return { dateStr, startTime, path: `/api/seats?${qs.toString()}` };
}

export function BookSeat() {
  const today = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => new Date(Date.now() + 7 * 86_400_000), []);
  const initialWindow = useMemo(() => getDefaultBookingWindow(), []);
  const initialCache = getApiCache<{ floors: Floor[]; seats: Seat[] }>(initialWindow.path);

  const [date, setDate] = useState(initialWindow.dateStr);
  const [startTime, setStartTime] = useState(initialWindow.startTime);
  const [durationMin, setDurationMin] = useState(120);

  const [floors, setFloors] = useState<Floor[]>(initialCache?.floors ?? []);
  const [seats, setSeats] = useState<Seat[]>(initialCache?.seats ?? []);
  const [activeFloorId, setActiveFloorId] = useState(initialCache?.floors?.[0]?.id ?? '');
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState(!initialCache);

  const [groupName, setGroupName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPass, setCreatedPass] = useState<{
    booking: BookingRecord;
    entryPass: EntryPass;
  } | null>(null);

  const { startAt, endAt } = useMemo(() => {
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(start.getTime() + durationMin * 60_000);
    return { startAt: start, endAt: end };
  }, [date, startTime, durationMin]);

  const seatsPath = useMemo(() => {
    const qs = new URLSearchParams({
      from: startAt.toISOString(),
      to: endAt.toISOString(),
    });
    return `/api/seats?${qs.toString()}`;
  }, [startAt, endAt]);

  const fetchSeats = useCallback(
    async (force = false) => {
      try {
        const cached = getApiCache<{ floors: Floor[]; seats: Seat[] }>(seatsPath);
        if (cached && !force) {
          setFloors(cached.floors);
          setSeats(cached.seats);
          if (cached.floors.length > 0) {
            setActiveFloorId((prev) => prev || cached.floors[0].id);
          }
        }
        if (!cached) setLoadingMap(true);
        const res = await apiFetchCached<{ floors: Floor[]; seats: Seat[] }>(seatsPath, {
          maxAgeMs: 20_000,
          force,
        });
        setFloors(res.floors);
        setSeats(res.seats);
        if (res.floors.length > 0) {
          setActiveFloorId((prev) => prev || res.floors[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load floor map.');
      } finally {
        setLoadingMap(false);
      }
    },
    [seatsPath],
  );

  useEffect(() => {
    void fetchSeats(false);
    const timer = setInterval(() => void fetchSeats(true), 120_000);
    return () => clearInterval(timer);
  }, [fetchSeats]);

  useRealtime(['bookings', 'seats'], () => {
    void fetchSeats(true);
  });

  const selectedSeat = seats.find((s) => s.id === selectedSeatId) ?? null;
  const favouriteSeats = useMemo(() => seats.filter((s) => s.is_favourite), [seats]);

  const handleToggleFavourite = async (seat: Seat) => {
    try {
      if (seat.is_favourite) {
        await apiFetch(`/api/seats/${seat.id}/favourite`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/seats/${seat.id}/favourite`, { method: 'POST' });
      }
      setSeats((prev) =>
        prev.map((s) => (s.id === seat.id ? { ...s, is_favourite: !s.is_favourite } : s)),
      );
    } catch {
      // ignore
    }
  };

  const handleConfirmBooking = async (overrideSeatId?: string) => {
    const targetSeatId = overrideSeatId ?? selectedSeatId;
    if (!targetSeatId) {
      setError('Select an available desk on the floor plan first.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const inviteEmails = inviteInput
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes('@'));

      const payload: Record<string, unknown> = {
        seatId: targetSeatId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      };

      if (selectedSeat?.seat_type === 'group_room' || groupName.trim() || inviteEmails.length > 0) {
        if (groupName.trim()) payload.groupName = groupName.trim();
        if (inviteEmails.length > 0) payload.inviteEmails = inviteEmails;
      }

      const res = await apiFetch<{ booking: BookingRecord; entryPass: EntryPass }>(
        '/api/bookings',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      setCreatedPass(res);
      setGroupName('');
      setInviteInput('');
      void fetchSeats();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Could not create reservation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[var(--border-color)]">
          <div>
            <div className="meta-label">// 02. INTERACTIVE ARCHITECTURAL BLUEPRINT</div>
            <h1 className="font-poster text-4xl sm:text-5xl mt-1">RESERVE A READING DESK</h1>
          </div>
          <button
            type="button"
            onClick={() => void fetchSeats(true)}
            className="self-start btn-slide px-3.5 py-2.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingMap ? 'animate-spin' : ''}`} />
            SYNC FLOOR MAP
          </button>
        </div>

        {/* Favourite Seats Bar */}
        {favouriteSeats.length > 0 && (
          <div className="editorial-card p-4 flex flex-wrap items-center gap-3">
            <span className="meta-label inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 fill-current" /> FAVOURITE DESKS:
            </span>
            {favouriteSeats.map((fav) => (
              <div
                key={fav.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--border-strong)] bg-[var(--bg-primary)] text-xs font-mono font-bold"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveFloorId(fav.floor_id);
                    setSelectedSeatId(fav.id);
                  }}
                >
                  {fav.label}
                </button>
                {fav.status === 'available' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleConfirmBooking(fav.id)}
                    className="btn-slide btn-slide-solid px-2 py-0.5 text-[10px]"
                  >
                    1-TAP
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Split Layout: Floor Plan + Reservation Form */}
        <div className="grid xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8">
            <SeatMap
              floors={floors}
              seats={seats}
              activeFloorId={activeFloorId}
              onFloorChange={setActiveFloorId}
              selectedSeatId={selectedSeatId}
              onSelectSeat={(seat) => {
                setSelectedSeatId(seat.id);
                setError(null);
              }}
              onToggleFavourite={handleToggleFavourite}
            />
          </div>

          <div className="xl:col-span-4 space-y-4">
            <div className="editorial-card p-5 space-y-4 border-[var(--border-strong)]">
              <h2 className="font-poster text-2xl flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
                <Calendar className="h-5 w-5" /> RESERVATION SLIP
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="meta-label block mb-1">DATE (UP TO +7 DAYS)</label>
                  <input
                    type="date"
                    value={date}
                    min={toLocalDateInput(today)}
                    max={toLocalDateInput(maxDate)}
                    onChange={(e) => setDate(e.target.value)}
                    className="editorial-input font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="meta-label block mb-1">START TIME</label>
                    <select
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="editorial-input font-mono"
                    >
                      {START_TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="meta-label block mb-1">DURATION</label>
                    <select
                      value={durationMin}
                      onChange={(e) => setDurationMin(Number(e.target.value))}
                      className="editorial-input font-mono"
                    >
                      {DURATIONS_MIN.map((m) => (
                        <option key={m} value={m}>
                          {m < 60
                            ? `${m} MIN`
                            : m % 60 === 0
                              ? `${m / 60} HR${m > 60 ? 'S' : ''}`
                              : `${Math.floor(m / 60)}H 30M`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {selectedSeat?.seat_type === 'group_room' && (
                <div className="p-3.5 border border-[var(--border-strong)] bg-[var(--bg-primary)] space-y-2.5">
                  <div className="meta-label flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> GROUP SUITE (UP TO {selectedSeat.capacity})
                  </div>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Study group title"
                    className="editorial-input text-xs"
                  />
                  <textarea
                    rows={2}
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="Invite classmates by Gmail (comma separated)"
                    className="editorial-input text-xs"
                  />
                </div>
              )}

              {/* Summary */}
              <div className="border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 space-y-2 text-xs uppercase tracking-[0.08em]">
                <div className="meta-label pb-1 border-b border-[var(--border-color)]">SUMMARY</div>
                <div className="flex justify-between">
                  <span className="opacity-70">SELECTED DESK</span>
                  <span className="font-mono font-bold">
                    {selectedSeat ? selectedSeat.label : 'NONE'}
                  </span>
                </div>
                {selectedSeat && (
                  <div className="flex justify-between">
                    <span className="opacity-70">ZONE</span>
                    <span className="font-semibold">{selectedSeat.section}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="opacity-70">SLOT</span>
                  <span className="font-mono flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {startTime}–
                    {endAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">STATUS</span>
                  <span className="font-bold">
                    {selectedSeat ? selectedSeat.status : 'PICK A DESK'}
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 border border-rose-400/70 bg-rose-500/15 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedSeat || selectedSeat.status !== 'available' || submitting}
                onClick={() => void handleConfirmBooking()}
                className="btn-slide btn-slide-solid w-full py-3.5 text-xs"
              >
                {submitting ? (
                  'ISSUING ENTRY PASS…'
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    CONFIRM DESK &amp; GENERATE QR →
                  </>
                )}
              </button>

              <p className="text-[11px] opacity-75 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Unclaimed desks auto-release 15 minutes after start time.
              </p>
            </div>
          </div>
        </div>
      </div>

      {createdPass && (
        <EntryPassModal
          booking={createdPass.booking}
          entryPass={createdPass.entryPass}
          onClose={() => setCreatedPass(null)}
        />
      )}
    </AppShell>
  );
}
