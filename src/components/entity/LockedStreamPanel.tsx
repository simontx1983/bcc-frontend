/**
 * LockedStreamPanel — §N8 / §B5 stream gate for unclaimed entities.
 *
 * The "Wanted Poster" narrative isn't complete until the stream slot
 * itself reads as locked. Three ghosted preview rows with a lock
 * overlay + a quiet CTA that points back at the IdentityBlock's
 * Claim flow (the actual entry point — this panel doesn't host its
 * own modal trigger to avoid two CTAs competing for attention).
 *
 * Server component — no state, no interactivity, pure CSS + JSX.
 * Replaces the generic <streamEmptyState> empty card on EntityProfile
 * when `card.is_claimed === false`.
 */

interface LockedStreamPanelProps {
  /** Display name of the entity ("Blacksmith Node"). Used in copy. */
  pageName: string;
}

export function LockedStreamPanel({ pageName }: LockedStreamPanelProps) {
  return (
    <div className="bcc-panel relative mx-auto max-w-2xl overflow-hidden p-6">
      {/* Ghosted preview — three rows that suggest what a real stream
          would look like. Pure CSS; no real data. */}
      <ul aria-hidden className="space-y-4 opacity-30">
        <li>
          <div className="flex items-center gap-2">
            <span className="bcc-stencil text-ink">{pageName}</span>
            <span
              className="bcc-mono rounded px-1.5 py-0.5 text-[9px]"
              style={{ background: "rgba(15,13,9,0.06)", color: "var(--ink-soft)" }}
            >
              POSTED
            </span>
          </div>
          <p className="mt-1 font-serif text-ink">
            ████████ █████ ██ ████ ██████ ███ ████.
          </p>
        </li>
        <li>
          <div className="flex items-center gap-2">
            <span className="bcc-stencil text-ink">{pageName}</span>
            <span
              className="bcc-mono rounded px-1.5 py-0.5 text-[9px]"
              style={{ background: "rgba(15,13,9,0.06)", color: "var(--ink-soft)" }}
            >
              ANNOUNCED
            </span>
          </div>
          <p className="mt-1 font-serif text-ink">
            █████ ██████ ███████ █████ ██ ███████ ████ ███.
          </p>
        </li>
        <li>
          <div className="flex items-center gap-2">
            <span className="bcc-stencil text-ink">{pageName}</span>
            <span
              className="bcc-mono rounded px-1.5 py-0.5 text-[9px]"
              style={{ background: "rgba(15,13,9,0.06)", color: "var(--ink-soft)" }}
            >
              REVIEWED
            </span>
          </div>
          <p className="mt-1 font-serif text-ink">
            ███████████ █████ ████████ ███ ██ ███ ████.
          </p>
        </li>
      </ul>

      {/* Lock overlay — radial fade so the ghosted text bleeds through
          at the edges (signals "this exists" without making the
          preview legible). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(247,242,225,0.55) 0%, rgba(247,242,225,0.92) 80%)",
        }}
      />

      {/* Centered lock state — sits above the overlay. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <LockMark />
        <p
          className="bcc-mono text-[10px] tracking-[0.24em]"
          style={{ color: "var(--safety)" }}
        >
          STREAM LOCKED
        </p>
        <h2 className="bcc-stencil text-2xl text-ink md:text-3xl">
          {pageName} hasn&apos;t claimed this page.
        </h2>
        <p className="max-w-md font-serif text-ink-soft">
          The operator&apos;s bio and stream unlock the moment they sign
          a challenge with their on-chain keys. Until then, this slot
          stays quiet.
        </p>
        <p className="bcc-mono text-[11px] text-cardstock-deep">
          Operators: see the Claim CTA above.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LockMark — small SVG padlock in safety-orange. Used here only;
// promote to a shared icon if a third surface needs it.
// ─────────────────────────────────────────────────────────────────────

function LockMark() {
  return (
    <svg
      aria-hidden
      width="36"
      height="36"
      viewBox="0 0 36 36"
      className="drop-shadow-[0_0_4px_rgba(240,90,40,0.45)]"
    >
      <path
        d="M11 16 V12 a7 7 0 0 1 14 0 V16"
        fill="none"
        stroke="#f05a28"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="8"
        y="16"
        width="20"
        height="14"
        rx="2"
        fill="#f05a28"
        stroke="#0f0d09"
        strokeWidth="1.4"
      />
      <circle cx="18" cy="22" r="2" fill="#0f0d09" />
      <rect x="17.4" y="22" width="1.2" height="4" fill="#0f0d09" />
    </svg>
  );
}
