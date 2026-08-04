"use client";

/**
 * DisputeDetail — full-page case-file surface for /disputes/[id].
 *
 * Mounted at /disputes/{id} after the server route validates the param.
 * No detail endpoint exists; we resolve the row by id from the
 * /disputes/mine query cache. When the query succeeds but doesn't hold
 * the id, we render a "case not found" state — that lets a stale
 * deeplink land gracefully without a network 404 shape we don't have a
 * handler for.
 *
 * The community-vote surface (Rank Phase 6) rides GET /disputes/{id}/vote:
 *   - while the vote is OPEN, the aside shows the viewer's own ballot
 *     (cast / change / withdraw) and nothing else — C10: tallies stay
 *     sealed until the vote closes;
 *   - once CLOSED, the aside shows <VoteResultBreakdown> (outcome +
 *     counted voters + the weighted uphold/reject bar).
 *
 * OLD-BACKEND TOLERANCE: production may still run the panel-era backend
 * where the vote route 404s. useDisputeVote surfaces that as undefined
 * data and the aside renders NOTHING — never fabricate viewer state.
 *
 * Phase 3.3 split: this file keeps the cache-resolution shell + the
 * CaseFile composition; the panels live in sibling modules
 * (CaseFileChrome / CaseHeader / CaseBody / VoteResultBreakdown).
 */

import { useState } from "react";

import {
  useCastDisputeVote,
  useDisputeVote,
  useMyDisputes,
  useWithdrawDisputeVote,
} from "@/hooks/useDisputes";
import { humanizeCode, isCode } from "@/lib/api/errors";
import {
  BccApiError,
  type Dispute,
  type DisputeVoteChoice,
  type DisputeVoteViewerState,
} from "@/lib/api/types";

import { CaseBody } from "./CaseBody";
import {
  CaseFileChrome,
  CaseFileError,
  CaseFileMissing,
  CaseFileSkeleton,
} from "./CaseFileChrome";
import { formatAbsoluteUTC } from "./caseFileFormat";
import { CaseHeader } from "./CaseHeader";
import { VoteResultBreakdown } from "./VoteResultBreakdown";

interface DisputeDetailProps {
  id: number;
}

export function DisputeDetail({ id }: DisputeDetailProps) {
  const myDisputes = useMyDisputes();
  const voteState = useDisputeVote(id);

  const dispute = myDisputes.data?.find((d) => d.id === id) ?? null;

  if (myDisputes.isPending) {
    return <CaseFileChrome>{<CaseFileSkeleton />}</CaseFileChrome>;
  }

  if (myDisputes.isError) {
    return (
      <CaseFileChrome>
        <CaseFileError
          message={
            // §γ — copy is keyed on err.code; never render err.message.
            humanizeCode(
              myDisputes.error,
              {
                bcc_unauthorized: "Sign in to view this case.",
                bcc_rate_limited: "Loading too fast — give it a moment and try again.",
                bcc_unavailable: "This case is temporarily unavailable. Try again shortly.",
              },
              "Couldn't load this case.",
            )
          }
        />
      </CaseFileChrome>
    );
  }

  if (dispute === null) {
    return (
      <CaseFileChrome>
        <CaseFileMissing id={id} />
      </CaseFileChrome>
    );
  }

  return (
    <CaseFileChrome caseNumber={dispute.id}>
      <CaseFile dispute={dispute} voteState={voteState.data} />
    </CaseFileChrome>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CaseFile — the populated case-file surface. Composition:
//   • Header block (CASE №id + status pill + page title quote + meta)
//     overlaid with a diagonal verdict stamp when resolved.
//   • Two-column body (md+):
//       LEFT  — the reason, evidence, chain-of-custody timeline.
//       RIGHT — the community-vote aside: the viewer's own ballot while
//               the vote is open, the closed result breakdown after.
//               Empty when no viewer state exists (old backend).
// ─────────────────────────────────────────────────────────────────────

function CaseFile({
  dispute,
  voteState,
}: {
  dispute: Dispute;
  voteState: DisputeVoteViewerState | undefined;
}) {
  const resolved = dispute.status !== "reviewing";

  return (
    <article className="mt-10">
      <CaseHeader dispute={dispute} resolved={resolved} />

      <div className="mt-12 grid gap-10 md:grid-cols-[1fr_minmax(320px,400px)] md:gap-12">
        <CaseBody dispute={dispute} />

        <aside className="flex flex-col gap-8 md:sticky md:top-24 md:self-start">
          {voteState !== undefined &&
            voteState.status === "open" &&
            dispute.status === "reviewing" && (
              <BallotCard disputeId={dispute.id} state={voteState} />
            )}
          {voteState !== undefined && voteState.status === "closed" && (
            <VoteResultBreakdown state={voteState} />
          )}
        </aside>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BallotCard — the viewer's own ballot while the community vote is
// open. Shows the viewer's choice + effective weight, cast controls
// when no ballot exists, change/withdraw controls when the server says
// so (can_change / can_withdraw). Eligibility lives entirely on the
// server — a deny comes back as bcc_dispute_vote_forbidden with a
// machine reason we map to copy.
//
// C10: no running totals anywhere on this card; the sealed-tally line
// says so explicitly.
// ─────────────────────────────────────────────────────────────────────

function BallotCard({
  disputeId,
  state,
}: {
  disputeId: number;
  state: DisputeVoteViewerState;
}) {
  const cast = useCastDisputeVote();
  const withdraw = useWithdrawDisputeVote();
  const [error, setError] = useState<string | null>(null);

  const { my_choice, my_effective_weight, can_change, can_withdraw } =
    state.viewer;
  const busy = cast.isPending || withdraw.isPending;

  const handleCast = (choice: DisputeVoteChoice): void => {
    if (busy) return;
    setError(null);
    cast.mutate(
      { disputeId, request: { choice } },
      { onError: (err) => setError(humanizeBallotError(err)) },
    );
  };

  const handleWithdraw = (): void => {
    if (busy) return;
    setError(null);
    withdraw.mutate(
      { disputeId },
      { onError: (err) => setError(humanizeBallotError(err)) },
    );
  };

  const showCastControls = my_choice === null || can_change;

  return (
    <section
      aria-label="Your ballot"
      className="border-2 border-bcc-border p-6"
    >
      <p className="bcc-mono text-bcc-text-secondary">YOUR BALLOT //</p>

      {my_choice === null ? (
        <p className="mt-3 font-serif leading-relaxed text-bcc-text">
          Weigh the reason and the evidence, then make the call.
        </p>
      ) : (
        <p className="bcc-stencil mt-3 text-2xl text-bcc-text">
          {CHOICE_LABEL[my_choice]}
          {my_effective_weight !== null && (
            <span className="bcc-mono ml-3 align-middle text-[12px] tracking-[0.18em] text-bcc-text-secondary">
              WEIGHT {my_effective_weight.toFixed(2)}
            </span>
          )}
        </p>
      )}

      {showCastControls && (
        <div className="mt-5 flex flex-col gap-2">
          <ChoiceButton
            label="UPHOLD THE DISPUTE"
            active={my_choice === "uphold"}
            disabled={busy || my_choice === "uphold"}
            onClick={() => handleCast("uphold")}
          />
          <ChoiceButton
            label="REJECT THE DISPUTE"
            active={my_choice === "reject"}
            disabled={busy || my_choice === "reject"}
            onClick={() => handleCast("reject")}
          />
        </div>
      )}

      {can_withdraw && (
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={busy}
          className="bcc-mono mt-3 text-bcc-text-secondary underline underline-offset-4 transition hover:text-safety disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {withdraw.isPending ? "WITHDRAWING…" : "WITHDRAW BALLOT"}
        </button>
      )}

      {error !== null && (
        <p role="alert" className="bcc-mono mt-4 text-safety">
          {error}
        </p>
      )}

      <p className="bcc-mono mt-5 border-t border-dashed border-bcc-border pt-4 text-bcc-text-muted">
        TALLIES STAY SEALED UNTIL THE VOTE CLOSES &middot; RESOLVES BY{" "}
        {formatAbsoluteUTC(state.expires_at)}
      </p>
    </section>
  );
}

const CHOICE_LABEL: Record<DisputeVoteChoice, string> = {
  uphold: "UPHOLD",
  reject: "REJECT",
};

function ChoiceButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        "bcc-stencil border px-4 py-2.5 text-left text-[12px] tracking-[0.2em] transition motion-reduce:transition-none " +
        (active
          ? "border-safety text-safety"
          : disabled
            ? "cursor-not-allowed border-bcc-border text-bcc-text-muted"
            : "border-bcc-border text-bcc-text hover:border-safety hover:text-safety")
      }
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Ballot error humanizer — §γ: branch on err.code (and the documented
// machine `data.reason` of bcc_dispute_vote_forbidden), never on
// err.message. Copy is authored here, not echoed from the server.
// ─────────────────────────────────────────────────────────────────────

const FORBIDDEN_REASON_COPY: Record<string, string> = {
  not_authenticated: "Sign in to vote on disputes.",
  suspended: "Suspended accounts can't vote on disputes.",
  rank_required: "Reach Apprentice rank to vote on disputes.",
  tier_required: "Reach Neutral standing to vote on disputes.",
  party_to_dispute:
    "You're a party to this dispute — parties can't vote on their own case.",
  party_check_unavailable: "This dispute isn't accepting votes right now.",
  fraud_blocked: "Voting is temporarily unavailable for this account.",
};

function humanizeBallotError(err: unknown): string {
  if (isCode(err, "bcc_dispute_vote_forbidden") && err instanceof BccApiError) {
    const reason = err.data?.["reason"];
    if (typeof reason === "string") {
      const copy = FORBIDDEN_REASON_COPY[reason];
      if (copy !== undefined) return copy;
    }
    return "You're not eligible to vote on this dispute.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to vote on disputes.",
      bcc_dispute_vote_recast_exhausted:
        "You've used all your ballot changes on this dispute.",
      bcc_dispute_vote_cooldown:
        "You withdrew recently — ballots reopen after a 24-hour cooldown.",
      bcc_dispute_vote_not_found:
        "No active ballot to act on. Refresh and try again.",
      bcc_dispute_vote_closed:
        "This vote closed before your ballot landed. Refresh to see the result.",
      rate_limited: "Too fast — wait a few seconds and try again.",
      bcc_rate_limited: "Too fast — wait a few seconds and try again.",
    },
    "Couldn't record your ballot. Try again.",
  );
}
