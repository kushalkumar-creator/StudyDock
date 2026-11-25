import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Book } from '../types';

interface StackVolume {
  id: string;
  spineCode: string;
  title: string;
  author: string;
  year: string;
  clothClass: string;
  width: number;
  depth: number;
  height: number;
  baseRotZ: number;
  baseOffsetX: number;
  callNumber: string;
}

const FALLBACK_VOLUMES: StackVolume[] = [
  {
    id: 'VOL-01',
    spineCode: '01',
    title: 'DESIGNING DATA-INTENSIVE APPS',
    author: 'M. KLEPPMANN',
    year: '2017',
    clothClass: 'cloth-sand',
    width: 300,
    depth: 214,
    height: 36,
    baseRotZ: -2,
    baseOffsetX: -4,
    callNumber: 'F1-CS-01',
  },
  {
    id: 'VOL-02',
    spineCode: '02',
    title: 'FEYNMAN LECTURES ON PHYSICS',
    author: 'R. P. FEYNMAN',
    year: '2011',
    clothClass: 'cloth-cyprus-light',
    width: 292,
    depth: 208,
    height: 33,
    baseRotZ: 2,
    baseOffsetX: 4,
    callNumber: 'F2-PH-04',
  },
  {
    id: 'VOL-03',
    spineCode: '03',
    title: 'INTERPRETATION OF PROGRAMS',
    author: 'ABELSON & SUSSMAN',
    year: '1996',
    clothClass: 'cloth-sand-warm',
    width: 304,
    depth: 216,
    height: 36,
    baseRotZ: -1,
    baseOffsetX: -2,
    callNumber: 'F1-CS-02',
  },
  {
    id: 'VOL-04',
    spineCode: '04',
    title: 'SAPIENS: HISTORY OF HUMANKIND',
    author: 'Y. N. HARARI',
    year: '2015',
    clothClass: 'cloth-cyprus-deep',
    width: 288,
    depth: 204,
    height: 31,
    baseRotZ: 3,
    baseOffsetX: 6,
    callNumber: 'F1-HI-12',
  },
  {
    id: 'VOL-05',
    spineCode: '05',
    title: 'DEEP LEARNING',
    author: 'GOODFELLOW ET AL.',
    year: '2016',
    clothClass: 'cloth-sand',
    width: 296,
    depth: 210,
    height: 35,
    baseRotZ: -3,
    baseOffsetX: -6,
    callNumber: 'F3-AI-01',
  },
];

export function Hero3D({
  featuredBooks,
  onFanChange,
}: {
  featuredBooks: Book[];
  onFanChange?: (pct: number) => void;
}) {
  const navigate = useNavigate();
  const rigRef = useRef<HTMLDivElement | null>(null);
  const bookRefs = useRef<Array<HTMLDivElement | null>>([]);
  const onFanChangeRef = useRef(onFanChange);
  onFanChangeRef.current = onFanChange;

  const volumes = useMemo<StackVolume[]>(() => {
    if (featuredBooks.length === 0) return FALLBACK_VOLUMES;
    return FALLBACK_VOLUMES.map((template, idx) => {
      const b = featuredBooks[idx];
      if (!b) return template;
      return {
        ...template,
        id: b.id,
        title: b.title.toUpperCase(),
        author: b.author.toUpperCase(),
        year: b.published_year ? String(b.published_year) : template.year,
        callNumber: b.shelf_location || b.isbn || template.callNumber,
      };
    });
  }, [featuredBooks]);

  useEffect(() => {
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let targetFanProgress = 0;
    let fanProgress = 0;
    let autoSpinAngle = 0;
    let lastTouchY: number | null = null;
    let lastTime = performance.now();
    let lastReportedPct = -1;
    let rafId = 0;

    const getScale = () => (window.innerWidth < 768 ? 0.72 : 1);

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetFanProgress = Math.min(1, Math.max(0, targetFanProgress + e.deltaY * 0.0012));
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        lastTouchY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        const touch = e.touches[0];
        targetMouseX = (touch.clientX / window.innerWidth) * 2 - 1;
        targetMouseY = (touch.clientY / window.innerHeight) * 2 - 1;
        if (lastTouchY !== null) {
          const deltaY = lastTouchY - touch.clientY;
          targetFanProgress = Math.min(1, Math.max(0, targetFanProgress + deltaY * 0.003));
        }
        lastTouchY = touch.clientY;
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      currentMouseX += (targetMouseX - currentMouseX) * 0.08;
      currentMouseY += (targetMouseY - currentMouseY) * 0.08;
      fanProgress += (targetFanProgress - fanProgress) * 0.1;

      const pct = Math.round(fanProgress * 100);
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        onFanChangeRef.current?.(pct);
      }

      autoSpinAngle += dt * 10;

      const basePitch = 58 - fanProgress * 14 + currentMouseY * -12;
      const baseYaw = -22 + Math.sin(autoSpinAngle * (Math.PI / 180)) * 14 + currentMouseX * 22;
      const baseRoll = -36 + currentMouseX * 6;

      if (rigRef.current) {
        rigRef.current.style.transform = `rotateX(${basePitch.toFixed(2)}deg) rotateY(${baseYaw.toFixed(2)}deg) rotateZ(${baseRoll.toFixed(2)}deg)`;
      }

      const scale = getScale();
      const count = volumes.length;
      const mid = (count - 1) / 2;

      volumes.forEach((book, idx) => {
        const el = bookRefs.current[idx];
        if (!el) return;
        const bh = Math.round(book.height * scale);
        el.style.setProperty('--bw', `${Math.round(book.width * scale)}px`);
        el.style.setProperty('--bd', `${Math.round(book.depth * scale)}px`);
        el.style.setProperty('--bh', `${bh}px`);

        const rel = idx - mid;
        const baseZ = rel * (bh + 2);
        const spreadZ = baseZ + rel * fanProgress * 54;
        const fanRotZ = book.baseRotZ + rel * fanProgress * 16 + currentMouseX * rel * 4;
        const fanX = book.baseOffsetX + rel * fanProgress * 24;
        const fanY = Math.abs(rel) * fanProgress * 12;

        el.style.transform = `translate3d(${fanX.toFixed(1)}px, ${fanY.toFixed(1)}px, ${spreadZ.toFixed(1)}px) rotateZ(${fanRotZ.toFixed(2)}deg)`;
      });

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [volumes]);

  return (
    <div
      className="book-stage absolute inset-0 z-20 flex items-center justify-center"
      aria-label="Interactive 3D stack of 5 hardcover books"
    >
      <div
        ref={rigRef}
        className="book-stack-rig"
        title="Move cursor or scroll wheel to fan out the 5 volumes; click any volume to open in catalogue"
      >
        {volumes.map((book, idx) => (
          <div
            key={book.id}
            ref={(node) => {
              bookRefs.current[idx] = node;
            }}
            className="hardcover-book"
            role="button"
            tabIndex={0}
            aria-label={`Open ${book.title} in book catalogue`}
            onClick={() => navigate(`/books?search=${encodeURIComponent(book.title)}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/books?search=${encodeURIComponent(book.title)}`);
              }
            }}
          >
            <div className={`book-cover-top ${book.clothClass}`}>
              <div className="flex items-center justify-between text-[9px] font-bold tracking-[0.2em] uppercase opacity-75">
                <span>STUDYDOCK PRESS</span>
                <span>VOL. {book.spineCode}</span>
              </div>
              <div className="my-auto">
                <div className="font-poster text-xl sm:text-2xl leading-[0.92] tracking-tight line-clamp-2">
                  {book.title}
                </div>
                <div className="text-[10px] font-bold tracking-[0.16em] uppercase mt-1.5 opacity-80 truncate">
                  {book.author} · {book.year}
                </div>
              </div>
              <div className="flex items-center justify-between text-[8px] font-bold tracking-[0.18em] uppercase opacity-65 border-t border-current/25 pt-1.5">
                <span>ARCHIVE EDITION</span>
                <span>{book.callNumber}</span>
              </div>
            </div>
            <div className={`book-cover-bottom ${book.clothClass}`} />
            <div className={`book-spine ${book.clothClass}`}>
              <span className="text-[9px] font-bold tracking-[0.16em] uppercase opacity-80">
                {book.spineCode}
              </span>
              <span className="font-poster text-xs sm:text-sm tracking-wide truncate px-2">
                {book.title}
              </span>
              <span className="text-[8px] font-bold tracking-[0.14em] uppercase opacity-75">
                {book.year}
              </span>
            </div>
            <div className="book-pages-right" />
            <div className="book-pages-left" />
            <div className="book-pages-back" />
          </div>
        ))}
      </div>
    </div>
  );
}
