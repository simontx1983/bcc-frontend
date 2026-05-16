/**
 * ReputationSummaryPanel — §J.6 reputation-first summary on operator
 * profiles and entity cards. The load-bearing surface for the
 * counter-party-trust-decision test (§J.13.3).
 *
 * Layout, top to bottom:
 *   - Reputation Score (large headline) + verbal phrase from
 *     divergence_state. Heuristic #1: no naked numbers — the phrase
 *     always pairs with the number when divergence_state is known.
 *   - Chip row: standing chip (GOOD STANDING / UNDER REVIEW) +
 *     Trust Tier chip (via existing RankChip — rank flavored by tier) +
 *     Reliability Standing badge (positive-only per §J.3.2) +
 *     moderation flags.
 *   - Loud negative-state strap when triggered: Under Review,
 *     Polarizing, Disputed, or Poorly Regarded. Safety-orange,
 *     present-tense problems (heuristic #7).
 *   - Subtle supplemental signals when triggered: Reputation Volatile,
 *     Unresolved Claims count. Neutral tone — historical context, not
 *     alarm (heuristic #7).
 *
 * Server-rendered per §A2 — every label and badge text the panel
 * displays comes from the server-supplied view-model. The panel
 * renders, never derives. The verbal phrase mapping from
 * divergence_state to display copy is presentation-only (a label
 * table, not a derivation).
 *
 * Synthesis invisibility (§J.4.1): the panel never exposes weights,
 * caps, multipliers, or any rule that produces the score. Users see
 * the outcome (Reputation Score number + verbal phrase + badges),
 * not the math.
 *
 * Empty states (heuristic #9):
 *   - `reputation_score` absent → "Will form as they participate"
 *     friendly invitation. Backend may not ship this field in the
 *     earliest Phase 1 increments; surface stays coherent regardless.
 *   - `reliability_standing` absent → no badge rendered (asymmetric
 *     display: no negative badge ever; absence of positive is the
 *     resting state).
 *   - `divergence_state` absent → no verbal phrase next to the score
 *     (Phase 1 sequencing: divergence-state classifier ships Week 2
 *     per the Phase 1 plan).
 *
 * Asymmetric public-display (§J.3.2): the numeric reliability score
 * (e.g. 0.73) is NEVER passed to this component. Self-mirror surfaces
 * the number separately. This panel shows public badges only.
 */

import { RankChip } from "@/components/profile/RankChip";
import { ReliabilityStandingBadge } from "@/components/reliability/ReliabilityStandingBadge";
import type {
  CardTier,
  DivergenceState,
  ReliabilityStandingPublic,
} from "@/lib/api/types";

interface ReputationSummaryPanelProps {
  /**
   * §J.6 composite headline. Absent in Phase 1 increments before the
   * synthesis layer ships; component renders empty-state copy.
   */
  reputationScore: number | undefined;
  /**
   * §J.3.2 positive-only public badge. Absent (undefined or null)
   * when the operator hasn't earned a public badge.
   */
  reliabilityStanding: ReliabilityStandingPublic | null | undefined;
  /** §C1 card-tier slug. Passed through to RankChip. */
  cardTier: CardTier;
  /** §A2 server-rendered tier display string. Passed through to RankChip. */
  tierLabel: string | null;
  /** §A2 server-rendered rank display string. Passed through to RankChip. */
  rankLabel: string;
  /** §E1 good-standing flag. Drives the standing chip. */
  isInGoodStanding: boolean;
  /** Existing V1 moderation flag catalogue (suspended, shadow_limited, etc.). */
  flags: string[];
  /**
   * §J.2 five-state classifier. Absent in early Phase 1 increments;
   * component falls back to no verbal phrase next to the score.
   */
  divergenceState: DivergenceState | null | undefined;
  /** §J.6 derived signal — active dispute exists. */
  underReview: boolean | undefined;
  /** §J.6 derived signal — rapid Reputation Score swing in a rolling window. */
  reputationVolatile: boolean | undefined;
  /** §J.6 derived signal — open dispute + content-report total. */
  unresolvedClaimsCount: number | undefined;
}

const DIVERGENCE_LABEL: Record<DivergenceState, string> = {
  untested: "Untested",
  well_regarded: "Well Regarded",
  poorly_regarded: "Poorly Regarded",
  polarizing: "Polarizing",
  disputed: "Disputed",
};

/**
 * Divergence states that should surface as a LOUD negative-state strap
 * per heuristic #7. `well_regarded` and `untested` surface without
 * alarm UI.
 */
function isLoudDivergence(state: DivergenceState | null | undefined): boolean {
  return (
    state === "polarizing" || state === "disputed" || state === "poorly_regarded"
  );
}

export function ReputationSummaryPanel(props: ReputationSummaryPanelProps) {
  const loudNegative =
    (props.underReview ?? false) || isLoudDivergence(props.divergenceState);

  const hasSubtleSignal =
    (props.reputationVolatile ?? false) ||
    (props.unresolvedClaimsCount ?? 0) > 0;

  return (
    <section aria-label="Reputation summary" className="flex flex-col gap-4">
      <ReputationHeadline
        score={props.reputationScore}
        divergenceState={props.divergenceState ?? null}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StandingChip isInGoodStanding={props.isInGoodStanding} />
        <RankChip
          cardTier={props.cardTier}
          tierLabel={props.tierLabel}
          rankLabel={props.rankLabel}
        />
        {props.reliabilityStanding !== undefined &&
          props.reliabilityStanding !== null && (
            <ReliabilityStandingBadge standing={props.reliabilityStanding} />
          )}
        {props.flags.map((flag) => (
          <span
            key={flag}
            className="bcc-mono border border-safety/60 px-2 py-[3px] text-safety"
          >
            {flag.toUpperCase().replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {loudNegative && (
        <LoudNegativeStateStrap
          underReview={props.underReview ?? false}
          divergenceState={props.divergenceState ?? null}
        />
      )}

      {hasSubtleSignal && (
        <SubtleSupplementalSignals
          reputationVolatile={props.reputationVolatile ?? false}
          unresolvedClaimsCount={props.unresolvedClaimsCount ?? 0}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Reputation headline — score + verbal phrase, with designed empty
// state per heuristic #9.
// ─────────────────────────────────────────────────────────────────────

function ReputationHeadline({
  score,
  divergenceState,
}: {
  score: number | undefined;
  divergenceState: DivergenceState | null;
}) {
  if (score === undefined) {
    return (
      <div className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          REPUTATION
        </span>
        <p className="font-serif text-cardstock-deep italic">
          Will form as they participate.
        </p>
      </div>
    );
  }

  const phrase =
    divergenceState !== null ? DIVERGENCE_LABEL[divergenceState] : null;

  return (
    <div className="flex flex-col gap-1">
      <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
        REPUTATION
      </span>
      <div className="flex items-baseline gap-3">
        <span
          className="bcc-stencil text-cardstock leading-none"
          style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
        >
          {score}
        </span>
        {phrase !== null && (
          <span className="bcc-mono text-cardstock-deep">{phrase}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Standing chip — GOOD STANDING / UNDER REVIEW. Order matters per the
// existing /u/[handle] note: standing-first lets the rank chip's
// tier-tinted rail render without the green-on-green collision that
// happens for uncommon-tier operators.
// ─────────────────────────────────────────────────────────────────────

function StandingChip({ isInGoodStanding }: { isInGoodStanding: boolean }) {
  if (isInGoodStanding) {
    return (
      <span className="bcc-mono bg-verified px-2 py-[3px] text-white">
        ✓ GOOD STANDING
      </span>
    );
  }
  return (
    <span className="bcc-mono border border-safety/60 px-2 py-[3px] text-safety">
      UNDER REVIEW
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loud negative-state strap — heuristic #7 "visible BUT calibrated."
// Safety-orange present-tense alarm for actionable problems:
// active dispute + polarizing / disputed / poorly_regarded states.
// ─────────────────────────────────────────────────────────────────────

function LoudNegativeStateStrap({
  underReview,
  divergenceState,
}: {
  underReview: boolean;
  divergenceState: DivergenceState | null;
}) {
  const divergenceBadge =
    divergenceState !== null && isLoudDivergence(divergenceState)
      ? DIVERGENCE_LABEL[divergenceState]
      : null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-l-[3px] border-safety bg-safety/10 px-3 py-2"
    >
      {underReview && (
        <span className="bcc-mono text-safety">⚠ UNDER REVIEW</span>
      )}
      {divergenceBadge !== null && (
        <span className="bcc-mono text-safety">
          ⚠ {divergenceBadge.toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Subtle supplemental signals — historical context per heuristic #7.
// Neutral tone — these aren't alarms, they're additional facts
// counter-parties may weigh. Volatile = score swung recently;
// unresolved_claims_count = numeric honesty without editorializing.
// ─────────────────────────────────────────────────────────────────────

function SubtleSupplementalSignals({
  reputationVolatile,
  unresolvedClaimsCount,
}: {
  reputationVolatile: boolean;
  unresolvedClaimsCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-cardstock-deep">
      {reputationVolatile && (
        <span className="bcc-mono">REPUTATION VOLATILE</span>
      )}
      {unresolvedClaimsCount > 0 && (
        <span className="bcc-mono">
          {unresolvedClaimsCount}{" "}
          {unresolvedClaimsCount === 1
            ? "UNRESOLVED CLAIM"
            : "UNRESOLVED CLAIMS"}
        </span>
      )}
    </div>
  );
}