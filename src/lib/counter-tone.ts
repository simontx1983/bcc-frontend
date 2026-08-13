/**
 * counterToneClass — the shared tone ladder for character counters.
 *
 * Seven counters across the composer, blog, messages and comment surfaces
 * each re-implemented the same escalation, differing only in their warning
 * threshold. This centralises the *tone choice* and nothing else: every
 * caller keeps its own element, separator spacing, suffix children, id,
 * `aria-live`, `hidden` and surrounding classes.
 *
 * That is deliberate. A component absorbing all seven would need eleven
 * props — value, max, warnAt, minLength, className, tag, separator,
 * children, id, aria-live, hidden — because their markup genuinely is not
 * standard. One of them renders a `<p>`, two write `n/max` while five write
 * `n / max`, and two carry suffix content. Only the ladder repeats, so only
 * the ladder is shared.
 *
 * The rungs:
 *
 *   over the limit   → `text-safety`
 *   near the limit   → `text-warning`      (only when `warnAt` is given)
 *   otherwise        → `text-bcc-text-secondary`
 *
 * The bottom rung was `--bcc-text-muted`, which measures 2.54:1 light and
 * 2.28:1 dark — failing AA as text. `--bcc-text-secondary` clears it at
 * 7.56 / 6.15, and stays distinguishable from `text-warning` (5.02 light,
 * 8.81 dark) by both hue and lightness.
 *
 * ⚠ The top rung is deliberately untouched. `--bcc-safety` is a single
 * unscoped `#f05a28` measuring 3.39:1 in light theme, so it fails as text —
 * but `text-safety` is separately scoped work and is not repaired here.
 * Do not "fix" it by editing this helper.
 */

/**
 * @param value  current length
 * @param max    the hard limit; above it the counter reads as an error
 * @param warnAt optional soft threshold; above it the counter warns.
 *               Omit for the two-rung callers that have no warning state.
 */
export function counterToneClass(value: number, max: number, warnAt?: number): string {
  if (value > max) return "text-safety";
  if (warnAt !== undefined && value > warnAt) return "text-warning";
  return "text-bcc-text-secondary";
}
