/**
 * StatusTick — the ✓ / ○ mark beside a checklist row.
 *
 * One meaning everywhere: `--bcc-success` for done, `--bcc-text-secondary`
 * for not-done. Both clear the 3:1 non-text bar in both themes.
 *
 * The mark is `aria-hidden` on purpose — every consumer renders a text
 * label beside it that already carries the state, so announcing a bare
 * glyph would only duplicate it. That makes this a graphical object under
 * WCAG 1.4.11 (3:1), not text (4.5:1), but both tokens clear 4.5:1 anyway.
 *
 * `sizeClass` is the one escape hatch, and it is deliberately a single
 * string rather than a variant system: three consumers want the default
 * `text-lg` mark, one sits in a compact row and inherits its parent's
 * size by passing `""`. Four symbols do not need a design system.
 */

export interface StatusTickProps {
  /** Completed state — drives both the glyph and the colour. */
  done: boolean;
  /**
   * Typography for the mark. Defaults to the checklist size; pass `""`
   * to inherit from the surrounding row.
   */
  sizeClass?: string;
}

const DEFAULT_SIZE = "bcc-mono text-lg leading-none";

export function StatusTick({ done, sizeClass = DEFAULT_SIZE }: StatusTickProps) {
  const tone = done ? "text-[var(--bcc-success)]" : "text-bcc-text-secondary";
  return (
    <span aria-hidden className={sizeClass === "" ? tone : `${sizeClass} ${tone}`}>
      {done ? "✓" : "○"}
    </span>
  );
}
