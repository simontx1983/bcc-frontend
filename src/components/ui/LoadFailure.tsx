/**
 * LoadFailure — shared Twitter-style "couldn't load" state: a muted glyph,
 * the error copy, and a real Retry button. Used anywhere a query's error
 * branch needs more than a text link (feed, comments, …) — see
 * HANDOVER-ux-batch-landing-mobile-comments.md Item 2.
 */

function DisconnectedGlyph() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
      className="text-[var(--bcc-text-muted)]"
    >
      <path
        d="M8 17.5a5 5 0 0 1 1.2-9.85"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 17.5a5 5 0 0 0-1.9-9.65A6 6 0 0 0 7 8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2 3"
      />
      <path
        d="M11.5 15.5 14 18l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path d="M4 4 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.87M13.5 2.5v3.5H10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LoadFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <DisconnectedGlyph />
      <p role="alert" className="text-[13px] text-[var(--bcc-text-secondary)]">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="bcc-btn bcc-btn-sm bcc-btn-outline gap-1.5"
      >
        <RefreshIcon />
        Retry
      </button>
    </div>
  );
}
