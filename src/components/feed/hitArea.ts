/**
 * HIT_AREA_44 — a 44×44 tap target for a small control WITHOUT changing
 * how it looks (F-355). The action-row pills are drawn at 26px; padding or
 * negative margins would grow their hover fill, so instead an invisible
 * ::before, centred on the control, is at least 44×44. Pseudo-elements
 * take part in hit-testing for their element, so a tap anywhere on it
 * lands on the button. Callers must space neighbours so the enlarged
 * areas don't overlap (PostActionBar uses gap-x-3 for this).
 */
export const HIT_AREA_44 =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-[max(100%,2.75rem)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
