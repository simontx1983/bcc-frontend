/**
 * LoadFailure — shared "couldn't load" state: a muted glyph, the error
 * copy, and (when the caller can offer one) a real Retry button. Used
 * anywhere a query's error branch needs more than a text link (feed,
 * comments, …) — see HANDOVER-ux-batch-landing-mobile-comments.md Item 2.
 *
 * Two capabilities, both generic — resist growing a third:
 *
 *   • `surface` picks the palette family. Doctrine §5.3: this app has two
 *     of them, theme-aware app surfaces and fixed cream/ink paper, and
 *     crossing them is its most-repeated bug. The theme palette measured
 *     1.03:1 on paper in dark mode before Batch A, so a paper consumer
 *     MUST pass surface="paper" rather than inherit the default.
 *
 *   • `onRetry` is optional. Omit it and no button renders at all — no
 *     disabled shell, no empty action row. A retry control that cannot
 *     succeed (403, 404) is a lie; those states belong in purpose-built
 *     UI with a real exit, not a Retry the user will press twice.
 *
 * Every token below is contract-tested in LoadFailure.test.tsx, which
 * parses the real values out of globals.css and asserts WCAG ratios — so
 * a future palette edit that pushes either variant under AA fails there.
 */

type Surface = "theme" | "paper";

interface SurfaceTokens {
  /** Decorative glyph — aria-hidden, so exempt from the text bar. */
  glyph: string;
  /** The alert copy. Must clear AA against this surface's background. */
  message: string;
  /** Retry control, including its own focus ring where the global
   *  accent-coloured one would not survive the surface. */
  button: string;
}

/**
 * Kept as data rather than inline conditionals so the contract test can
 * import and assert against it directly.
 */
export const LOAD_FAILURE_TOKENS: Record<Surface, SurfaceTokens> = {
  theme: {
    glyph: "text-[var(--bcc-text-muted)]",
    message: "text-[var(--bcc-text-secondary)]",
    button: "bcc-btn bcc-btn-sm bcc-btn-outline gap-1.5",
  },
  paper: {
    // Fixed cream/ink family throughout.
    //
    // Why the button and focus ring are re-pointed at ink rather than
    // inheriting `.bcc-btn-outline` and the global
    // `:focus-visible { outline: 2px solid var(--bcc-accent) }` —
    // measured against --paper (#f7efd9) at the time of writing:
    // --bcc-primary 2.08:1, --bcc-secondary 2.11:1, --bcc-safety 2.95:1.
    // All three were too pale to carry a label or an outline here. That
    // is a snapshot of why this choice was made, not a rule that those
    // tokens must stay that way — if the palette improves, revisit.
    //
    // The border is 60% rather than a lighter tint because a translucent
    // border composites with the surface: over cream, ink/40 lands at
    // 2.61:1 and misses the 3:1 bar for UI boundaries (WCAG 1.4.11),
    // while ink/60 reaches 4.90:1.
    glyph: "text-ink-ghost",
    message: "text-ink-soft",
    button:
      "bcc-btn bcc-btn-sm gap-1.5 border-[1.5px] border-ink/60 bg-transparent " +
      "text-ink hover:bg-ink/5 focus-visible:outline-ink",
  },
};

function DisconnectedGlyph({ className }: { className: string }) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
      className={className}
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
  surface = "theme",
}: {
  message: string;
  /** Omit when retrying cannot help — no button is rendered at all. */
  onRetry?: () => void;
  /** Palette family of the surface this renders on. Defaults to the
   *  theme-aware app palette, so existing callers are unaffected. */
  surface?: Surface;
}) {
  const tokens = LOAD_FAILURE_TOKENS[surface];

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <DisconnectedGlyph className={tokens.glyph} />
      <p role="alert" className={"text-[13px] " + tokens.message}>
        {message}
      </p>
      {onRetry !== undefined && (
        <button type="button" onClick={onRetry} className={tokens.button}>
          <RefreshIcon />
          Retry
        </button>
      )}
    </div>
  );
}
