"use client";

/**
 * PanelVoteModal — §D5 cast-a-panel-vote flow.
 *
 * Triggered from <PanelQueue> when a panelist clicks a row. Single
 * screen:
 *   - decision picker (ACCEPT / REJECT — radio semantics)
 *   - optional note (≤500 chars; audit-log only, never shown to other
 *     panelists per the controller's privacy contract)
 *   - submit
 *
 * On success: invalidate the panel-queue query so the row's
 * `my_decision` flips and the "CAST YOUR VOTE" button becomes a
 * decision badge. The server intentionally omits running tallies from
 * the response — no optimistic accept/reject totals to splice.
 *
 * 10s server-side throttle on cast_vote is acknowledged via the
 * disabled-while-pending button; we don't replicate it client-side.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  MY_PARTICIPATION_QUERY_KEY,
  PANEL_QUEUE_QUERY_KEY_ROOT,
  useCastPanelVote,
} from "@/hooks/useDisputes";
import {
  BccApiError,
  type CastPanelVoteResponse,
  type PanelDispute,
} from "@/lib/api/types";

const NOTE_MAX_LENGTH = 500;

interface PanelVoteModalProps {
  dispute: PanelDispute;
  onClose: () => void;
}

export function PanelVoteModal({ dispute, onClose }: PanelVoteModalProps) {
  const queryClient = useQueryClient();
  const cast = useCastPanelVote();

  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Holds the server response after a successful cast so the modal can
  // swap to a result screen showing the §D5 credit state.
  const [result, setResult] = useState<CastPanelVoteResponse | null>(null);

  const noteOverCap = note.length > NOTE_MAX_LENGTH;
  const canSubmit = decision !== null && !noteOverCap && !cast.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || decision === null) return;
    setError(null);
    try {
      const trimmedNote = note.trim();
      const response = await cast.mutateAsync({
        disputeId: dispute.id,
        request: {
          decision,
          ...(trimmedNote !== "" ? { note: trimmedNote } : {}),
        },
      });
      void queryClient.invalidateQueries({
        queryKey: PANEL_QUEUE_QUERY_KEY_ROOT,
      });
      // Refresh the participation indicator on /panel — the credit
      // state just changed (or didn't, if a cap blocked the credit).
      void queryClient.invalidateQueries({
        queryKey: MY_PARTICIPATION_QUERY_KEY,
      });
      setResult(response);
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  // ── Result screen ──────────────────────────────────────────────────
  if (result !== null) {
    return (
      <ModalShell
        title="Vote recorded"
        onClose={onClose}
      >
        <ResultScreen result={result} onDismiss={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={`Vote on dispute against ${dispute.voter_name}`}
      onClose={() => {
        if (!cast.isPending) onClose();
      }}
    >
      <header className="mb-5">
        <p className="bcc-mono text-safety">YOUR CALL //</p>
        <h3 className="bcc-stencil mt-1 text-3xl text-ink">
          {dispute.page_title || "Untitled page"}
        </h3>
        <p className="mt-2 max-w-prose font-serif text-ink-soft">
          The page owner says the downvote from {dispute.voter_name} is
          invalid. Read the case below, then make the call. Tallies and
          your peers&rsquo; votes stay sealed until quorum &mdash;
          decide on the merits alone.
        </p>
      </header>

      <section className="bcc-panel mb-5 p-4">
        <p className="bcc-mono text-cardstock-deep">REPORTER&rsquo;S CASE //</p>
        <p
          className="mt-2 font-serif text-ink"
          style={{ fontSize: "14px", lineHeight: 1.5 }}
        >
          &ldquo;{dispute.reason}&rdquo;
        </p>
        {dispute.evidence_url !== "" && (
          <p className="mt-3">
            <span className="bcc-mono text-cardstock-deep">EVIDENCE: </span>
            <a
              href={dispute.evidence_url}
              target="_blank"
              rel="noreferrer noopener"
              className="bcc-mono break-all text-blueprint underline hover:text-safety"
            >
              {dispute.evidence_url}
            </a>
          </p>
        )}
      </section>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex flex-col gap-5"
      >
        <fieldset>
          <legend className="bcc-mono mb-3 text-cardstock-deep">
            YOUR DECISION //
          </legend>
          <div
            role="radiogroup"
            aria-label="Decision"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <DecisionOption
              value="accept"
              label="ACCEPT"
              description="The reporter has a case. Strike the downvote."
              accent="var(--verified)"
              selected={decision === "accept"}
              onSelect={() => setDecision("accept")}
            />
            <DecisionOption
              value="reject"
              label="REJECT"
              description="The downvote stands. The dispute is unfounded."
              accent="var(--safety)"
              selected={decision === "reject"}
              onSelect={() => setDecision("reject")}
            />
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="panel-note"
            className="bcc-mono mb-2 block text-cardstock-deep"
          >
            INTERNAL NOTE //
            <span className="ml-2 text-ink-ghost">
              (optional · audit log only)
            </span>
          </label>
          <textarea
            id="panel-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Anything operators should know about how you read this case."
            className="bcc-panel w-full p-3 font-serif text-ink"
            style={{ resize: "vertical" }}
          />
          <div className="bcc-mono mt-1 text-right text-cardstock-deep">
            {note.length}/{NOTE_MAX_LENGTH}
          </div>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-mono text-safety">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={cast.isPending}
            className="bcc-mono rounded-sm px-4 py-2 text-cardstock-deep hover:text-ink disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className={
              "bcc-stencil rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition " +
              (canSubmit
                ? "bg-ink text-cardstock hover:bg-blueprint"
                : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
            }
          >
            {cast.isPending ? "RECORDING…" : "RECORD VOTE"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ResultScreen — post-vote acknowledgement. Surfaces whether the §D5
// participation credit was recorded and renders the cap status so the
// panelist sees their progress without a follow-up fetch. Honest UX:
// if the credit was skipped, we say WHY rather than silently dropping it.
// ─────────────────────────────────────────────────────────────────────

function ResultScreen({
  result,
  onDismiss,
}: {
  result: CastPanelVoteResponse;
  onDismiss: () => void;
}) {
  const { decision, participation } = result;
  const accepted = decision === "accept";
  const accent = accepted ? "var(--verified)" : "var(--safety)";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="bcc-mono text-safety">VOTE RECORDED //</p>
        <h3 className="bcc-stencil mt-1 text-3xl text-ink">
          You voted {accepted ? "ACCEPT" : "REJECT"}.
        </h3>
        <p className="mt-2 font-serif text-ink-soft">
          Your call is sealed and the panel keeps deliberating. Tallies
          stay hidden until quorum.
        </p>
      </header>

      <section
        className="bcc-paper p-4"
        style={{
          boxShadow: `inset 0 0 0 2px ${
            participation.credited ? accent : "rgba(15,13,9,0.16)"
          }`,
        }}
      >
        <p className="bcc-mono text-cardstock-deep">PARTICIPATION CREDIT //</p>
        <p
          className="bcc-stencil mt-1 text-2xl"
          style={{ color: participation.credited ? accent : "var(--ink)" }}
        >
          {participation.credited
            ? "+1 panel-vote credit"
            : "No credit this time"}
        </p>
        <p
          className="mt-2 font-serif text-ink-soft"
          style={{ fontSize: "14px", lineHeight: 1.5 }}
        >
          {creditExplanation(
            participation.credited,
            participation.reason,
          )}
        </p>
        <p className="bcc-mono mt-3 text-ink-ghost">
          {participation.credited_today} VOTE
          {participation.credited_today === 1 ? "" : "S"} TODAY ·{" "}
          {participation.credited_lifetime} LIFETIME
        </p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="bcc-stencil rounded-sm bg-ink px-5 py-2.5 text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint"
        >
          DONE
        </button>
      </div>
    </div>
  );
}

function creditExplanation(
  credited: boolean,
  reason: CastPanelVoteResponse["participation"]["reason"],
): string {
  if (credited) {
    return "Your accuracy is scored once the panel reaches a verdict. Correct calls add an extra weight to your trust score; mis-calls don't penalize.";
  }
  switch (reason) {
    case "daily_cap":
      return "You've hit the daily trust cap from panel duty. Your vote still counts toward the verdict — credits resume tomorrow.";
    case "total_cap":
      return "You've earned the lifetime trust maximum from panel duty. Your vote still counts toward the verdict; trust impact is capped at the lifetime ceiling.";
    case "suspended":
      return "Account is currently suspended. Your vote is on file but not credited.";
    case "fraud_flag":
      return "Account is under risk review. Your vote is on file but not credited until the review clears.";
    case "linked_users":
      return "Anti-abuse heuristic blocked this credit. Your vote still counts toward the verdict.";
    case "low_quality":
      return "This dispute was flagged as low-quality. Your vote stands but no credit is applied.";
    case "already_recorded":
      return "We already had a participation row for this dispute. Your vote stands.";
    case "service_unavailable":
    case null:
      return "Credit recording hit a transient error. Your vote stands; ops will reconcile if needed.";
  }
}

// ─────────────────────────────────────────────────────────────────────
// DecisionOption — one half of the accept/reject radio pair.
// ─────────────────────────────────────────────────────────────────────

function DecisionOption({
  value,
  label,
  description,
  accent,
  selected,
  onSelect,
}: {
  value: "accept" | "reject";
  label: string;
  description: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-value={value}
      onClick={onSelect}
      className={
        "bcc-paper p-4 text-left transition " +
        (selected ? "ring-2" : "hover:ring-1 hover:ring-cardstock-edge")
      }
      style={selected ? { boxShadow: `inset 0 0 0 2px ${accent}` } : undefined}
    >
      <span
        className="bcc-stencil block text-2xl"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="mt-1 block font-serif text-ink-soft">
        {description}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ModalShell — same idiom as Composer's modal variant / OpenDisputeModal.
// ─────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bcc-panel relative w-full max-w-2xl p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bcc-mono absolute right-4 top-4 text-cardstock-deep hover:text-ink"
        >
          ESC
        </button>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Error humanizer — typed mapping per §L2.
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: unknown): string {
  if (err instanceof BccApiError) {
    switch (err.code) {
      case "bcc_unauthorized":
        return "Sign in first.";
      case "not_assigned":
        return "You're not on this dispute's panel.";
      case "already_voted":
        return "You've already voted on this one.";
      case "invalid_decision":
        return "Pick accept or reject.";
      case "dispute_closed":
        return "This dispute resolved before your vote landed.";
      default:
        return err.message || "Couldn't record your vote. Try again.";
    }
  }
  return "Something went wrong. Try again.";
}