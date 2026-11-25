export function BookLogo({ className = 'w-8 h-7' }: { className?: string }) {
  return (
    <span
      className={`brand-book-logo relative inline-flex items-center justify-center shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Closed book state (visible by default, smoothly folds away on hover) */}
      <svg
        viewBox="0 0 64 56"
        className="brand-book-closed absolute inset-0 w-full h-full"
        fill="none"
      >
        {/* Closed hardcover front face */}
        <path d="M18 6 L48 11 L48 45 L18 40 Z" fill="currentColor" />
        {/* Spine band */}
        <path d="M14 6 L18 6 L18 40 L14 40 Z" fill="currentColor" fillOpacity="0.72" />
        {/* Subtle embossed cover lines */}
        <path d="M24 17 L42 20" stroke="var(--bg-primary)" strokeWidth="2.6" />
        <path d="M24 24 L38 26.3" stroke="var(--bg-primary)" strokeWidth="2.6" />
        {/* Closed bottom page block + back cover base */}
        <path d="M14 43 L48 48 L48 52 L14 47 Z" fill="currentColor" />
      </svg>

      {/* Open book state (matches exact Image 1 geometry, unfolds on hover) */}
      <svg
        viewBox="0 0 64 56"
        className="brand-book-open absolute inset-0 w-full h-full"
        fill="none"
      >
        {/* Left page */}
        <g className="brand-book-leaf-left">
          <path d="M5 9 L30 14 L30 42 L5 37 Z" fill="currentColor" />
          <path d="M10 18 L25.5 21" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M10 24.5 L25.5 27.5" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M10 31 L25.5 34" stroke="var(--bg-primary)" strokeWidth="2.6" />
        </g>

        {/* Right page */}
        <g className="brand-book-leaf-right">
          <path d="M59 9 L34 14 L34 42 L59 37 Z" fill="currentColor" />
          <path d="M38.5 21 L54 18" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M38.5 27.5 L54 24.5" stroke="var(--bg-primary)" strokeWidth="2.6" />
          <path d="M38.5 34 L54 31" stroke="var(--bg-primary)" strokeWidth="2.6" />
        </g>

        {/* Bottom spine cradle strip */}
        <path
          d="M5 40.5 L30 45.5 Q32 46 34 45.5 L59 40.5 L59 44.5 L34 49.5 Q32 50 30 49.5 L5 44.5 Z"
          fill="currentColor"
          className="brand-book-base"
        />
      </svg>
    </span>
  );
}
