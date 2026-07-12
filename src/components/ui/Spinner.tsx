/**
 * Spinner — the small inline loading ring (accent-colored via
 * `currentColor`). The full-logo ValidatorRing is for page-level
 * transitions; this is the lightweight one for buttons, load-more rows,
 * and inline "working…" spots. Spin is `motion-safe` so reduced-motion
 * users get a static ring.
 */

export function Spinner({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`motion-safe:animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
