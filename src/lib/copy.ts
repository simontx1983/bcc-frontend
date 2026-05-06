/**
 * Centralized UI copy for The Floor's "Keep Tabs" terminology.
 *
 * Three-axis vocabulary, mirrors the PHP override service at
 * app/public/wp-content/plugins/blue-collar-crypto-peepso-integration/app/Services/PeepSoLabelOverrides.php.
 *
 *   Verb (CTA)        : "Keep Tabs" / "keeping tabs on"
 *   State             : "Watching"
 *   Group noun        : "Watcher" / "Watchers"
 *   Superlative       : "Most Watched"
 *
 * Both tables are co-maintained per docs/pattern-registry.md →
 * "Follow terminology overrides". Drift will produce inconsistent UX
 * between PeepSo-rendered surfaces (legacy WP) and the Next.js app.
 *
 * The active CTA exposes a desktop / mobile pair because the verb form
 * "Keeping Tabs ✓" overflows the CardFactory grid-cols-3 button at
 * ≤375px viewports — the mobile twin uses the state word "Watching ✓"
 * which fits the same footprint as the previous "Pulled ✓".
 */
export const FOLLOW_COPY = {
  /** Default unfollowed-state CTA. Used everywhere a user is invited to start. */
  cta: "Keep Tabs",
  /** Active-state CTA on desktop / sm+ breakpoints. */
  ctaActiveDesktop: "Keeping Tabs ✓",
  /** Active-state CTA on <sm breakpoints. Falls back to the state word. */
  ctaActiveMobile: "Watching ✓",
  /** Tooltip when the user IS already kept-tabs (button toggles off). */
  tooltipActive: "In your binder. Click to remove.",
  /** Tooltip when the user IS NOT already kept-tabs (button toggles on). */
  tooltipIdle: "Keep tabs on this card",
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
  /** Verb phrase, mid-sentence — "Pick people you want to keep tabs on." */
  verbPhrase: "keep tabs on",
} as const;
