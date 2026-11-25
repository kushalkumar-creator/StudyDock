import {
  Heart,
  Lock,
  Maximize2,
  Search,
  Users,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTheme } from '../hooks/useTheme';
import type { Floor, Seat } from '../types';

interface SeatMapProps {
  floors: Floor[];
  seats: Seat[];
  activeFloorId: string;
  onFloorChange: (floorId: string) => void;
  selectedSeatId: string | null;
  onSelectSeat: (seat: Seat) => void;
  onToggleFavourite?: (seat: Seat) => void;
  compact?: boolean;
}

const STATUS_STYLE: Record<
  Seat['status'],
  { fill: string; stroke: string; badge: string; label: string; text: string }
> = {
  available: {
    fill: '#0E7D76',
    stroke: '#F0EDE5',
    badge: 'bg-emerald-400',
    label: 'AVAILABLE',
    text: '#F0EDE5',
  },
  reserved: {
    fill: '#D97706',
    stroke: '#FEF3C7',
    badge: 'bg-amber-400',
    label: 'RESERVED',
    text: '#FFFFFF',
  },
  occupied: {
    fill: '#BE123C',
    stroke: '#FFE4E6',
    badge: 'bg-rose-500',
    label: 'OCCUPIED',
    text: '#FFFFFF',
  },
  blocked: {
    fill: '#475569',
    stroke: '#CBD5E1',
    badge: 'bg-slate-400',
    label: 'MAINTENANCE',
    text: '#E2E8F0',
  },
};

export function SeatMap({
  floors,
  seats,
  activeFloorId,
  onFloorChange,
  selectedSeatId,
  onSelectSeat,
  onToggleFavourite,
  compact = false,
}: SeatMapProps) {
  const { theme } = useTheme();
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ active: boolean; startX: number; startY: number }>({
    active: false,
    startX: 0,
    startY: 0,
  });

  const floorSeats = useMemo(
    () => seats.filter((s) => s.floor_id === activeFloorId),
    [seats, activeFloorId],
  );

  const sections = useMemo(
    () => Array.from(new Set(floorSeats.map((s) => s.section))),
    [floorSeats],
  );

  const matchingSeatIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      floorSeats
        .filter(
          (s) =>
            s.label.toLowerCase().includes(q) ||
            s.table_no.toLowerCase().includes(q) ||
            s.section.toLowerCase().includes(q),
        )
        .map((s) => s.id),
    );
  }, [floorSeats, searchQuery]);

  const tables = useMemo(() => {
    const map = new Map<string, { tableNo: string; section: string; xs: number[]; ys: number[] }>();
    for (const s of floorSeats) {
      if (s.seat_type === 'group_room') continue;
      if (sectionFilter !== 'all' && s.section !== sectionFilter) continue;
      const entry = map.get(s.table_no) ?? {
        tableNo: s.table_no,
        section: s.section,
        xs: [],
        ys: [],
      };
      entry.xs.push(Number(s.x));
      entry.ys.push(Number(s.y));
      map.set(s.table_no, entry);
    }
    return Array.from(map.values()).map((t) => ({
      tableNo: t.tableNo,
      section: t.section,
      minX: Math.min(...t.xs) - 36,
      minY: Math.min(...t.ys) - 34,
      width: Math.max(...t.xs) - Math.min(...t.xs) + 72,
      height: Math.max(...t.ys) - Math.min(...t.ys) + 68,
    }));
  }, [floorSeats, sectionFilter]);

  const jumpToFirstSearchMatch = () => {
    const first = floorSeats.find((s) => matchingSeatIds.has(s.id));
    if (first) {
      onSelectSeat(first);
      setZoom(1.35);
      setPan({ x: (500 - Number(first.x)) * 0.45, y: (300 - Number(first.y)) * 0.45 });
    }
  };

  const handleMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-seat-node="true"]')) return;
    draggingRef.current = { active: true, startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  };

  const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!draggingRef.current.active) return;
    setPan({
      x: e.clientX - draggingRef.current.startX,
      y: e.clientY - draggingRef.current.startY,
    });
  };

  const handleMouseUp = () => {
    draggingRef.current.active = false;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const selectedSeat = floorSeats.find((s) => s.id === selectedSeatId) ?? null;
  const lineColor = theme === 'dark' ? 'rgba(240,237,229,0.22)' : 'rgba(0,70,67,0.22)';
  const tableFill = theme === 'dark' ? '#00312F' : '#E5E0D5';
  const selectStroke = theme === 'dark' ? '#F0EDE5' : '#004643';

  return (
    <div className="editorial-card overflow-hidden flex flex-col border-[var(--border-strong)]">
      {/* Floor Tabs */}
      <div className="p-4 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {floors.map((floor) => {
            const active = floor.id === activeFloorId;
            const freeCount = seats.filter(
              (s) => s.floor_id === floor.id && s.status === 'available',
            ).length;
            return (
              <button
                key={floor.id}
                type="button"
                onClick={() => {
                  onFloorChange(floor.id);
                  setSectionFilter('all');
                  resetView();
                }}
                className={`px-3.5 py-2 text-xs font-bold tracking-[0.12em] uppercase border transition-all flex items-center gap-2 ${
                  active
                    ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                    : 'border-[var(--border-color)] hover:border-[var(--border-strong)]'
                }`}
              >
                <span>FLOOR 0{floor.level}</span>
                <span className="font-mono text-[10px] opacity-80">[{freeCount}]</span>
              </button>
            );
          })}
        </div>

        {/* Search + Zoom */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 opacity-60 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') jumpToFirstSearchMatch();
              }}
              placeholder="FIND TABLE / SEAT"
              aria-label="Search table or seat"
              className="editorial-input pl-8 py-1.5 w-44 sm:w-52 text-xs uppercase tracking-wider"
            />
          </div>
          <div className="flex items-center border border-[var(--border-strong)]">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2, Number((z + 0.2).toFixed(2))))}
              aria-label="Zoom in"
              className="p-2 hover:bg-[var(--card-hover)]"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.2).toFixed(2))))}
              aria-label="Zoom out"
              className="p-2 border-x border-[var(--border-color)] hover:bg-[var(--card-hover)]"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset map view"
              className="p-2 hover:bg-[var(--card-hover)]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Section Filters + Legend */}
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSectionFilter('all')}
            className={`px-2.5 py-1 border transition-colors ${
              sectionFilter === 'all'
                ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                : 'border-transparent hover:border-[var(--border-color)] opacity-75'
            }`}
          >
            ALL ZONES
          </button>
          {sections.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSectionFilter(sec)}
              className={`px-2.5 py-1 border transition-colors ${
                sectionFilter === sec
                  ? 'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] border-[var(--btn-solid-bg)]'
                  : 'border-transparent hover:border-[var(--border-color)] opacity-75'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-[10px]">
          {(['available', 'reserved', 'occupied', 'blocked'] as const).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 inline-block ${STATUS_STYLE[st].badge}`} />
              {STATUS_STYLE[st].label}
            </span>
          ))}
        </div>
      </div>

      {/* Architectural SVG Floor Plan */}
      <div
        className={`relative bg-[var(--bg-primary)] overflow-hidden select-none ${
          compact ? 'h-[360px]' : 'h-[470px]'
        }`}
      >
        <svg
          viewBox="0 0 960 560"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <pattern id="swiss-blueprint" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke={lineColor}
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <rect
              x="30"
              y="24"
              width="900"
              height="512"
              fill="url(#swiss-blueprint)"
              stroke={lineColor}
              strokeWidth="1.5"
            />

            <text
              x="480"
              y="48"
              textAnchor="middle"
              fill="currentColor"
              fillOpacity="0.55"
              className="text-[10px] font-bold tracking-[0.28em] uppercase"
            >
              NORTH ARCHITECTURAL GLAZING
            </text>

            <rect
              x="410"
              y="520"
              width="140"
              height="20"
              fill={selectStroke}
              fillOpacity="0.12"
              stroke={selectStroke}
              strokeOpacity="0.5"
            />
            <text
              x="480"
              y="534"
              textAnchor="middle"
              fill="currentColor"
              className="text-[10px] font-bold tracking-[0.18em] uppercase"
            >
              STAIRS &amp; GATE ENTRY
            </text>

            {tables.map((t) => (
              <g key={t.tableNo}>
                <rect
                  x={t.minX}
                  y={t.minY}
                  width={t.width}
                  height={t.height}
                  fill={tableFill}
                  stroke={lineColor}
                  strokeWidth="1.5"
                />
                <text
                  x={t.minX + t.width / 2}
                  y={t.minY + t.height / 2 + 4}
                  textAnchor="middle"
                  fill="currentColor"
                  fillOpacity="0.55"
                  className="text-[11px] font-mono font-bold tracking-widest"
                >
                  {t.tableNo}
                </text>
              </g>
            ))}

            {floorSeats.map((seat) => {
              if (sectionFilter !== 'all' && seat.section !== sectionFilter) return null;

              const style = STATUS_STYLE[seat.status];
              const isSelected = seat.id === selectedSeatId;
              const isSearchHit = matchingSeatIds.has(seat.id);
              const isRoom = seat.seat_type === 'group_room';
              const x = Number(seat.x);
              const y = Number(seat.y);

              return (
                <g
                  key={seat.id}
                  data-seat-node="true"
                  onClick={() => onSelectSeat(seat)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Seat ${seat.label}, ${seat.section}, ${seat.status}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSeat(seat);
                    }
                  }}
                >
                  {(isSelected || isSearchHit) && (
                    <rect
                      x={isRoom ? x - 78 : x - 27}
                      y={isRoom ? y - 48 : y - 27}
                      width={isRoom ? 156 : 54}
                      height={isRoom ? 96 : 54}
                      fill="none"
                      stroke={isSelected ? selectStroke : '#fbbf24'}
                      strokeWidth="3"
                      strokeDasharray={isSearchHit && !isSelected ? '5 3' : undefined}
                    />
                  )}

                  {isRoom ? (
                    <>
                      <rect
                        x={x - 70}
                        y={y - 40}
                        width="140"
                        height="80"
                        fill={style.fill}
                        fillOpacity={seat.status === 'blocked' ? 0.45 : 0.94}
                        stroke={isSelected ? selectStroke : style.stroke}
                        strokeWidth={isSelected ? 2.5 : 1.2}
                      />
                      <text
                        x={x}
                        y={y - 6}
                        textAnchor="middle"
                        fill={style.text}
                        className="text-[12px] font-mono font-bold pointer-events-none"
                      >
                        {seat.label}
                      </text>
                      <text
                        x={x}
                        y={y + 14}
                        textAnchor="middle"
                        fill={style.text}
                        fillOpacity="0.85"
                        className="text-[9px] font-bold tracking-widest uppercase pointer-events-none"
                      >
                        SUITE · {seat.capacity} SEATS
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={x - 21}
                        y={y - 21}
                        width="42"
                        height="42"
                        fill={style.fill}
                        fillOpacity={seat.status === 'blocked' ? 0.45 : 0.94}
                        stroke={isSelected ? selectStroke : style.stroke}
                        strokeWidth={isSelected ? 2.5 : 1}
                      />
                      <text
                        x={x}
                        y={y + 4}
                        textAnchor="middle"
                        fill={style.text}
                        className="text-[11px] font-mono font-bold pointer-events-none"
                      >
                        {seat.seat_no}
                      </text>
                      {seat.seat_type === 'power' && (
                        <text
                          x={x + 14}
                          y={y - 10}
                          textAnchor="middle"
                          fill="#fbbf24"
                          className="text-[9px] font-bold pointer-events-none"
                        >
                          ⚡
                        </text>
                      )}
                      {seat.is_favourite && (
                        <text
                          x={x - 14}
                          y={y - 10}
                          textAnchor="middle"
                          fill="#fda4af"
                          className="text-[10px] pointer-events-none"
                        >
                          ♥
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {selectedSeat && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-80 editorial-card border-[var(--border-strong)] p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm">{selectedSeat.label}</span>
                <span className="text-[10px] px-2 py-0.5 border border-[var(--border-strong)] uppercase font-bold tracking-wider">
                  {selectedSeat.status}
                </span>
              </div>
              <p className="text-xs opacity-80 truncate mt-1 flex items-center gap-2 uppercase tracking-wider">
                {selectedSeat.section}
                {selectedSeat.seat_type === 'power' && (
                  <span className="inline-flex items-center gap-0.5">
                    <Zap className="h-3 w-3" /> POWER
                  </span>
                )}
                {selectedSeat.seat_type === 'group_room' && (
                  <span className="inline-flex items-center gap-0.5">
                    <Users className="h-3 w-3" /> MAX {selectedSeat.capacity}
                  </span>
                )}
                {selectedSeat.is_blocked && (
                  <span className="inline-flex items-center gap-0.5">
                    <Lock className="h-3 w-3" /> {selectedSeat.block_reason || 'BLOCKED'}
                  </span>
                )}
              </p>
            </div>
            {onToggleFavourite && (
              <button
                type="button"
                onClick={() => onToggleFavourite(selectedSeat)}
                aria-label="Toggle favourite seat"
                className="btn-slide p-2"
              >
                <Heart
                  className="h-4 w-4"
                  fill={selectedSeat.is_favourite ? 'currentColor' : 'none'}
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
