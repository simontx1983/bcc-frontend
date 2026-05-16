/**
 * ReliabilityStandingBadge — the single canonical render of a
 * reliability-standing pill.
 *
 * §J.3.2 positive-only catalogue: every value in the enum maps to a
 * neutral-or-celebratory chip. There is no negative variant — an
 * operator whose reliability softens loses their positive badge, never
 * gaining a stigma marker. (`newly_active` is the neutral starting
 * state, not a stigma.)
 *
 * Three consumers as of PR-2:
 *   - `ReputationSummaryPanel` — third-party + own-profile reputation
 *     surface; carries the badge inline alongside rank + good-standing
 *   - `AttestationRoster` — per-row attestor mini-view; carries the
 *     same badge as a tiny inline marker
 *   - `SelfMirrorReliabilityView` — operator's own self-mirror page,
 *     where the standing is the headline of the surface
 *
 * `RELIABILITY_LABEL` lives here too so the three consumers de-dupe
 * the display string. Filterable text (i18n) would land server-side
 * via the existing `bcc_*_label` filter pattern when needed; today
 * the strings are stable design copy.
 */

import type { ReliabilityStandingPublic } from "@/lib/api/types";

/**
 * Display label per §J.3.2 enum. Server-pinned values; the FE
 * renders verbatim per §A2. No client-side enum→label drift.
 */
export const RELIABILITY_LABEL: Record<ReliabilityStandingPublic, string> = {
  highly_reliable: "Highly Reliable",
  consistent: "Consistent",
  newly_active: "Newly Active",
};

/**
 * Render-time treatment is asymmetric across the enum: the two
 * earned standings (`highly_reliable`, `consistent`) get the
 * phosphor-tinted achievement chip; `newly_active` gets a neutral
 * cardstock-edged chip because it's the start of the curve, not a
 * downgrade. Matches the original treatment that lived inside
 * `ReputationSummaryPanel`.
 */
export function ReliabilityStandingBadge({
  standing,
}: {
  standing: ReliabilityStandingPublic;
}) {
  const label = RELIABILITY_LABEL[standing];
  const isAchievement =
    standing === "highly_reliable" || standing === "consistent";
  return (
    <span
      className={
        isAchievement
          ? "bcc-mono border border-phosphor/60 bg-phosphor/10 px-2 py-[3px] text-phosphor"
          : "bcc-mono border border-cardstock/30 px-2 py-[3px] text-cardstock-deep"
      }
    >
      {label.toUpperCase()}
    </span>
  );
}
