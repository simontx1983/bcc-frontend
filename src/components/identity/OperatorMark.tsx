import type { CSSProperties } from "react";

/**
 * OperatorMark — the rosette-and-check glyph for "verified operator/creator
 * on at least one entity" (§N8).
 *
 * Extracted from `AuthorCard` so the avatar's corner indicator can render the
 * SAME shape instead of a second, colour-only encoding of the same fact.
 *
 * ## Why the avatar indicator is a glyph and not a dot
 *
 * It used to be a bare `--phosphor` dot with a 2px `--cardstock` ring. That
 * failed twice over:
 *
 *   - **Colour was the only visual cue.** Every other operator surface pairs
 *     the fact with a label ("OPERATOR" chip on `AuthorBadge`) or this glyph.
 *     The dot was the lone exception.
 *   - **It was invisible.** Phosphor against its own cardstock ring measures
 *     **1.01:1** — the two colours differ in hue but barely in luminance.
 *
 * A colour swap could not fix it: the ring is theme-blind cream, while the
 * semantic greens are theme-scoped, so `--bcc-verified` clears 3:1 in light
 * (4.30) but fails in dark (2.74). The fix has to be structural.
 *
 * ## The `plate` variant
 *
 * On an avatar the glyph sits over arbitrary imagery, so it carries its own
 * fixed backing: an `--ink` rosette on a `--cardstock` plate, both theme-blind,
 * measuring **15.51:1** against each other in either theme. The plate is what
 * makes the contrast deterministic — the same technique the old ring used, now
 * with colours that actually differ.
 *
 * The default `inline` variant keeps the original accent-on-surface treatment
 * used beside a name, where the surrounding surface is already known.
 */

export interface OperatorMarkProps {
  /** Rendered size in px (square). */
  px?: number;
  /**
   * `inline` — accent glyph beside a name, on a known surface.
   * `plate` — theme-invariant ink-on-cardstock, for placement over imagery.
   */
  variant?: "inline" | "plate";
  /** Positioning classes. */
  className?: string;
  style?: CSSProperties;
  /** Accessible name. Kept on the wrapper, not the svg. */
  label?: string;
}

export function OperatorMark({
  px = 15,
  variant = "inline",
  className = "",
  style,
  label = "Operator",
}: OperatorMarkProps) {
  const plated = variant === "plate";

  // Fixed-cream plate + fixed-ink glyph = 15.51:1, identical in both themes.
  const plateStyle: CSSProperties = plated
    ? {
        color: "var(--ink)",
        background: "var(--cardstock)",
        borderRadius: "9999px",
        padding: "1px",
        boxShadow: "0 0 0 1px var(--cardstock)",
      }
    : {};

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={`inline-flex shrink-0 items-center ${
        plated ? "" : "text-[var(--bcc-accent)]"
      } ${className}`}
      style={{ ...plateStyle, ...style }}
    >
      <svg width={px} height={px} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.6 1.9 3.2-.1 1 3 2.6 1.8-1 3 1 3-2.6 1.8-1 3-3.2-.1L12 22l-2.6-1.9-3.2.1-1-3L2.6 15.4l1-3-1-3 2.6-1.8 1-3 3.2.1L12 2z" />
        <path
          d="M10.6 14.6l-2-2-1.1 1.1 3.1 3.1 5.3-5.3-1.1-1.1-4.2 4.2z"
          fill={plated ? "var(--cardstock)" : "var(--bcc-surface)"}
        />
      </svg>
    </span>
  );
}
