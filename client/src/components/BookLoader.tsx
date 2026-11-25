export function BookLoader({
  label,
  size = 'md',
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'sm' ? 'w-10 h-9' : size === 'lg' ? 'w-20 h-[70px]' : 'w-14 h-12';

  return (
    <div className="flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <div className={`book-loader relative inline-flex items-center justify-center ${dim}`} aria-hidden="true">
        {/* Closed hardcover state (cycles closed -> opens -> closes) */}
        <svg viewBox="0 0 64 56" className="book-loader-closed absolute inset-0 w-full h-full" fill="none">
          <path d="M18 6 L48 11 L48 45 L18 40 Z" fill="currentColor" />
          <path d="M14 6 L18 6 L18 40 L14 40 Z" fill="currentColor" fillOpacity="0.7" />
          <path d="M24 17 L42 20" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M24 24 L38 26.3" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M14 43 L48 48 L48 52 L14 47 Z" fill="currentColor" />
        </svg>

        {/* Open hardcover state with animated leaves + center turning page */}
        <svg viewBox="0 0 64 56" className="book-loader-open absolute inset-0 w-full h-full" fill="none">
          {/* Left leaf */}
          <g className="book-loader-leaf-left">
            <path d="M5 9 L30 14 L30 42 L5 37 Z" fill="currentColor" />
            <path d="M10 18 L25.5 21" stroke="var(--bg-primary)" strokeWidth="2.5" />
            <path d="M10 24.5 L25.5 27.5" stroke="var(--bg-primary)" strokeWidth="2.5" />
            <path d="M10 31 L25.5 34" stroke="var(--bg-primary)" strokeWidth="2.5" />
          </g>

          {/* Right leaf */}
          <g className="book-loader-leaf-right">
            <path d="M59 9 L34 14 L34 42 L59 37 Z" fill="currentColor" />
            <path d="M38.5 21 L54 18" stroke="var(--bg-primary)" strokeWidth="2.5" />
            <path d="M38.5 27.5 L54 24.5" stroke="var(--bg-primary)" strokeWidth="2.5" />
            <path d="M38.5 34 L54 31" stroke="var(--bg-primary)" strokeWidth="2.5" />
          </g>

          {/* Turning page leaf */}
          <g className="book-loader-page-turn">
            <path
              d="M32 14 L56 9.5 L56 37.5 L32 42 Z"
              fill="currentColor"
              fillOpacity="0.82"
              stroke="var(--bg-primary)"
              strokeWidth="1.2"
            />
          </g>

          {/* Spine cradle base */}
          <path
            d="M5 40.5 L30 45.5 Q32 46 34 45.5 L59 40.5 L59 44.5 L34 49.5 Q32 50 30 49.5 L5 44.5 Z"
            fill="currentColor"
            className="book-loader-base"
          />
        </svg>
      </div>

      {label ? (
        <p className="meta-label tracking-[0.22em] opacity-85">{label}</p>
      ) : null}
    </div>
  );
}
