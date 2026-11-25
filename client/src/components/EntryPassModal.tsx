import { CalendarPlus, Check, Copy, Download, QrCode, X } from 'lucide-react';
import { useState } from 'react';
import type { BookingRecord, EntryPass } from '../types';

export function EntryPassModal({
  booking,
  entryPass,
  onClose,
}: {
  booking: BookingRecord;
  entryPass: EntryPass;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!entryPass.sixDigitCode) return;
    await navigator.clipboard.writeText(entryPass.sixDigitCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const startStr = new Date(booking.start_at).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endStr = new Date(booking.end_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="editorial-card border-[var(--border-strong)] w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-[var(--marquee-bg)] text-[var(--marquee-text)] p-5 flex items-center justify-between border-b border-[var(--border-strong)]">
          <div className="flex items-center gap-3">
            <QrCode className="h-5 w-5" />
            <div>
              <h2 className="font-poster text-2xl leading-none">GATE ENTRY PASS</h2>
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase opacity-75 mt-0.5">
                SINGLE-USE HMAC-SIGNED CREDENTIAL
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close entry pass"
            className="p-1.5 hover:opacity-70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-center">
          <div className="inline-block p-3 bg-[#F0EDE5] border border-[var(--border-strong)]">
            <img
              src={entryPass.qrDataUrl}
              alt="Signed Entry QR Code"
              className="w-48 h-48 mx-auto"
            />
          </div>

          {entryPass.sixDigitCode && (
            <div className="bg-[var(--bg-primary)] border border-[var(--border-strong)] p-3.5">
              <div className="meta-label">MANUAL 6-DIGIT GATE CODE</div>
              <div className="flex items-center justify-center gap-3 mt-1">
                <span className="font-mono text-3xl font-bold tracking-[0.25em]">
                  {entryPass.sixDigitCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="btn-slide p-2"
                  title="Copy 6-digit code"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="text-left text-xs space-y-2 border-y border-[var(--border-color)] py-3.5 uppercase tracking-[0.08em]">
            <div className="flex justify-between">
              <span className="opacity-70">DESK</span>
              <span className="font-mono font-bold">{booking.seat?.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">LOCATION</span>
              <span className="font-semibold">
                {booking.seat?.floor?.name || 'ARCHIVE'} · {booking.seat?.section}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">WINDOW</span>
              <span className="font-mono">
                {startStr} – {endStr}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={entryPass.googleCalendarUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-slide py-2.5 px-3 text-[11px]"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              GOOGLE CAL
            </a>
            <a
              href={entryPass.qrDataUrl}
              download={`studydock-qr-${booking.seat?.label || 'pass'}.png`}
              className="btn-slide py-2.5 px-3 text-[11px]"
            >
              <Download className="h-3.5 w-3.5" />
              DOWNLOAD QR
            </a>
          </div>

          <p className="text-[11px] opacity-75">
            A copy has been emailed to you. Present at gate within 15 minutes of start time.
          </p>
        </div>
      </div>
    </div>
  );
}
