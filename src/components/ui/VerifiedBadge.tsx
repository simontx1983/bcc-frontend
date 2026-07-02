/**
 * VerifiedBadge — the single canonical render of the claim-verified
 * checkmark ("Verified Operator").
 *
 * Renders straight off a server view-model boolean (§A2 — the FE never
 * derives verification client-side). Distinct from email verification:
 * the search endpoints emit claim-verified flags
 * (`SearchSuggestion.is_verified`, `ProjectSearchResult.verified`) and
 * this badge is their only visual vocabulary.
 *
 * Visually quiet by design: a small mono checkmark chip in the
 * `--verified` accent (the same token every earned/positive state in
 * the design system uses — see WalletsSection's VERIFIED chip,
 * ClaimFlow success copy). Accessible name is "Verified Operator" via
 * sr-only text; the glyph itself is aria-hidden. No animation.
 *
 * Consumers:
 *   - `GlobalSearch` SuggestionRow — beside the tier chip
 *   - `SearchResultsTab` ProjectRow — beside the page name
 */

export function VerifiedBadge() {
  return (
    <span
      className="bcc-mono inline-flex shrink-0 items-center rounded-sm border border-verified/50 px-1 py-0.5 text-[9px] leading-none tracking-[0.18em]"
      style={{ color: "var(--verified)" }}
      title="Verified Operator"
    >
      <span aria-hidden>✓</span>
      <span className="sr-only">Verified Operator</span>
    </span>
  );
}
