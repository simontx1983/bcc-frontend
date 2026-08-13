/**
 * VoteResultBreakdown — closed-only result panel for a community
 * dispute vote (Rank Phase 6). Renders the outcome, the number of
 * counted voters, and the weighted uphold-vs-reject bar from the §17.3
 * closed tally on GET /disputes/{id}/vote.
 *
 * C10 discipline: this component renders server-provided CLOSED state
 * only — it returns null unless the vote is closed and the tally is
 * present, so it can never leak (or fabricate) a running total. The
 * only client-side math is bar proportion (presentation, not business
 * logic). Weighted ballots have no fixed denominator.
 *
 * Static presentation — no animation, so no reduced-motion branch.
 */

import type {
  DisputeVoteOutcome,
  DisputeVoteViewerState,
} from "@/lib/api/types";

import { formatAbsoluteUTC } from "./caseFileFormat";

export function VoteResultBreakdown({
  state,
}: {
  state: DisputeVoteViewerState;
}) {
  // Defensive: closed-only surface. An open state has no tally by
  // contract; render nothing rather than a fabricated zero-bar.
  if (state.status !== "closed" || state.tally === undefined) {
    return null;
  }

  const { counted_voters, weight_uphold, weight_reject } = state.tally;
  const totalWeight = weight_uphold + weight_reject;
  const upholdPct = totalWeight > 0 ? (weight_uphold / totalWeight) * 100 : 0;
  const rejectPct = totalWeight > 0 ? (weight_reject / totalWeight) * 100 : 0;

  const outcome = state.outcome ?? null;
  const outcomeConfig =
    outcome !== null ? OUTCOME_CONFIG[outcome] : FALLBACK_OUTCOME;

  return (
    <section
      aria-label="Community vote result"
      className="border-2 border-bcc-border p-6"
    >
      <p className="bcc-mono text-bcc-text-secondary">THE VOTE //</p>

      <p
        className="bcc-stencil mt-2 text-2xl"
        style={{ color: outcomeConfig.color }}
      >
        {outcomeConfig.label}
      </p>

      <p className="bcc-mono mt-3 text-bcc-text-secondary">
        {counted_voters} {counted_voters === 1 ? "VOTER" : "VOTERS"} COUNTED
        {state.closed_at !== null && state.closed_at !== undefined && (
          <> &middot; CLOSED {formatAbsoluteUTC(state.closed_at)}</>
        )}
      </p>

      {totalWeight > 0 ? (
        <div className="mt-5">
          <div
            role="img"
            aria-label={`Weighted result: uphold ${weight_uphold.toFixed(2)}, reject ${weight_reject.toFixed(2)}`}
            className="flex h-3 w-full overflow-hidden border border-bcc-border"
          >
            <span
              aria-hidden
              style={{
                width: `${upholdPct}%`,
                background: "var(--verified)",
              }}
            />
            <span
              aria-hidden
              style={{
                width: `${rejectPct}%`,
                background: "var(--safety)",
              }}
            />
          </div>

          <div className="bcc-mono mt-3 flex items-baseline justify-between gap-4">
            <span style={{ color: "var(--verified)" }}>
              UPHOLD {weight_uphold.toFixed(2)}
            </span>
            <span style={{ color: "var(--safety)" }}>
              REJECT {weight_reject.toFixed(2)}
            </span>
          </div>
          <p className="bcc-mono mt-1 text-bcc-text-secondary">
            WEIGHTED BALLOTS — NO FIXED DENOMINATOR
          </p>
        </div>
      ) : (
        <p className="bcc-mono mt-5 text-bcc-text-secondary">
          NO WEIGHTED BALLOTS WERE COUNTED.
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Outcome vocabulary — mirrors DisputeVoteService::OUTCOME_TO_VIEW.
// `upheld` is the reporter's win (downvote struck); `rejected` means
// the downvote stands; `inconclusive` means quorum/majority never met
// (no reporter penalty).
// ─────────────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<
  DisputeVoteOutcome,
  { label: string; color: string }
> = {
  upheld: { label: "UPHELD · DOWNVOTE STRUCK", color: "var(--verified)" },
  rejected: { label: "REJECTED · DOWNVOTE STANDS", color: "var(--safety)" },
  inconclusive: {
    label: "INCONCLUSIVE · NO QUORUM",
    color: "var(--bcc-text-secondary)",
  },
};

const FALLBACK_OUTCOME = {
  label: "VOTE CLOSED",
  color: "var(--bcc-text-secondary)",
} as const;
