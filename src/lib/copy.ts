/**
 * Centralized UI copy for The Floor's "Watch" terminology.
 *
 * 2026-07-21: the CTA/verb axis unified from "Keep Tabs" → "Watch" (Tia's
 * call, to be mirrored on the PHP side — PeepSoLabelOverrides.php — so the
 * legacy PeepSo surfaces don't drift). "Watch" inflects cleanly across all
 * forms (watch / watching / watched / watchers), so the whole vocabulary is
 * now one word family instead of the "keep tabs" verb + "watch" state split.
 *
 *   Verb (CTA)        : "Watch" / "watch"
 *   State             : "Watching"
 *   Group noun        : "Watcher" / "Watchers"
 *   Superlative       : "Most Watched"
 *
 * Both tables are co-maintained per docs/pattern-registry.md →
 * "Follow terminology overrides". Drift will produce inconsistent UX
 * between PeepSo-rendered surfaces (legacy WP) and the Next.js app.
 *
 * The active CTA still exposes a desktop / mobile pair; "Watching ✓" fits
 * the CardFactory grid-cols-3 button footprint at ≤375px.
 */
export const FOLLOW_COPY = {
  /** Default idle-state CTA. Used everywhere a user is invited to start. */
  cta: "Watch",
  /** Active-state CTA on desktop / sm+ breakpoints. */
  ctaActiveDesktop: "Watching ✓",
  /** Active-state CTA on <sm breakpoints. */
  ctaActiveMobile: "Watching ✓",
  /** Tooltip when the user IS already watching (button toggles off). */
  tooltipActive: "Watching. Click to unwatch.",
  /** Tooltip when the user IS NOT already watching (button toggles on). */
  tooltipIdle: "Watch this card",
  /** State word — used in tabs, captions, descriptions. */
  state: "Watching",
  /** State word, lowercase / mid-sentence. */
  stateLower: "watching",
  /** Group noun, plural — "248 Watchers". */
  noun: "Watchers",
  /** Group noun, plural, all-caps — used in stencil count labels. */
  nounUpper: "WATCHERS",
  /** Group noun, singular. */
  nounSingular: "Watcher",
  /** Used in CountsStrip / profile labels for the "I'm watching" count. */
  watchingUpper: "WATCHING",
  /** Verb phrase, mid-sentence — "Pick people you want to watch." */
  verbPhrase: "watch",
} as const;
