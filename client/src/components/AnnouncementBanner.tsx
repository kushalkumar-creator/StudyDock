import { AlertTriangle, Bell, Info, X } from 'lucide-react';
import { useState } from 'react';
import type { Announcement } from '../types';

export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = announcements.filter((a) => a.active && !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="w-full shrink-0 z-50">
      {visible.map((item) => {
        const tone =
          item.level === 'urgent'
            ? 'bg-rose-700 text-[#F0EDE5]'
            : item.level === 'warning'
              ? 'bg-amber-400 text-[#00312F]'
              : 'bg-[var(--marquee-bg)] text-[var(--marquee-text)]';

        const Icon =
          item.level === 'urgent' ? AlertTriangle : item.level === 'warning' ? Bell : Info;

        return (
          <div
            key={item.id}
            className={`${tone} border-b border-[var(--border-strong)] px-4 sm:px-8 py-2 text-xs font-bold tracking-[0.1em] uppercase`}
          >
            <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="px-1.5 py-0.5 border border-current/40 text-[10px] shrink-0">
                  {item.level}
                </span>
                <span>{item.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setDismissed((prev) => [...prev, item.id])}
                aria-label="Dismiss announcement"
                className="p-1 hover:opacity-70 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
