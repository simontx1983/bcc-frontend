"use client";

/**
 * YourCallPanel — voting UI for panelists on /disputes/[id]. Three
 * branches:
 *   • already voted             → locked decision badge + lifetime counts
 *   • reviewing + not voted     → ACCEPT / REJECT + optional note + submit
 *   • dispute already resolved  → no action; brief "you weren't on this"
 *                                 hint when applicable
 * On a successful cast the local CastPanelVoteResponse drives an inline
 * "VOTE RECORDED" panel — we don't wait for the queue refetch, the
 * invalidation kicks the fetch in the background.
 *
 * Extracted from DisputeDetail.tsx (Phase 3.3 god-component split);
 * markup and behavior unchanged. ReporterWaiting (the reporter-side
 * counterpart panel) and the dispute-vote error copy ride along.
 */

import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import {
  MY_DISPUTES_QUERY_KEY_ROOT,
  MY_PARTICIPATION_QUERY_KEY,
  PANEL_QUEUE_QUERY_KEY_ROOT,
  useCastPanelVote,
} from "@/hooks/useDisputes";
import { humanizeCode } from "@/lib/api/errors";
import {
  type CastPanelVoteResponse,
  type MyParticipationStatus,
  type PanelDispute,
} from "@/lib/api/types";

const NOTE_MAX_LENGTH = 500;

export function YourCallPanel({
  dispute,
  participation,
}: {
  dispute: PanelDispute;
  participation: MyParticipationStatus | null;
}) {
  const queryClient = useQueryClient();
  const cast = useCastPanelVote();

  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CastPanelVoteResponse | null>(null);

  const noteOverCap = note.length > NOTE_MAX_LENGTH;
  const canSubmit = decision !== null && !noteOverCap && !cast.isPending;
  const reviewing = dispute.status === "reviewing";

  if (result !== null) {
    return <YourCallRecorded result={result} />;
  }

  if (dispute.my_decision !== null) {
    return (
      <YourCallLocked
        decision={dispute.my_decision}
        participation={participation}
      />
    );
  }

  if (!reviewing) {
    return (
      <section
        className="border-2 border-ink/30 p-5"
        style={{ background: "var(--paper)" }}
      >
        <p className="bcc-mono text-cardstock-deep">YOUR CALL //</p>
        <p className="bcc-stencil mt-2 text-2xl text-ink">CASE CLOSED</p>
        <p className="bcc-mono mt-2 text-ink-ghost">
          Deliberation ended before your vote landed.
        </p>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
      void queryClient.invalidateQueries({
        queryKey: MY_DISPUTES_QUERY_KEY_ROOT,
      });
      void queryClient.invalidateQueries({
        queryKey: MY_PARTICIPATION_QUERY_KEY,
      });
      setResult(response);
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="border-2 border-ink/30 p-5"
      style={{ background: "var(--paper)" }}
    >
      <p className="bcc-mono text-safety">YOUR CALL //</p>
      <p className="bcc-stencil mt-1 text-2xl text-ink">Cast your vote.</p>

      <fieldset className="mt-4">
        <legend className="sr-only">Decision</legend>
        <div role="radiogroup" aria-label="Decision" className="grid gap-2">
          <DecisionButton
            value="accept"
            label="ACCEPT"
            description="The reporter has a case. Strike the downvote."
            accent="var(--verified)"
            selected={decision === "accept"}
            onSelect={() => setDecision("accept")}
          />
          <DecisionButton
            value="reject"
            label="REJECT"
            description="The downvote stands. The dispute is unfounded."
            accent="var(--safety)"
            selected={decision === "reject"}
            onSelect={() => setDecision("reject")}
          />
        </div>
      </fieldset>

      <div className="mt-4">
        <label
          htmlFor="case-note"
          className="bcc-mono mb-2 block text-cardstock-deep"
        >
          INTERNAL NOTE //
          <span className="ml-2 text-ink-ghost">
            (optional · audit log only)
          </span>
        </label>
        <textarea
          id="case-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Anything operators should know about how you read this case."
          className="w-full border border-ink/30 bg-transparent p-3 font-serif text-ink"
          style={{ resize: "vertical" }}
        />
        <div className="bcc-mono mt-1 text-right text-cardstock-deep">
          {note.length}/{NOTE_MAX_LENGTH}
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono mt-3 text-safety">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        className={
          "bcc-stencil mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-[13px] tracking-[0.22em] transition motion-reduce:transition-none " +
          (canSubmit
            ? "bg-ink text-cardstock hover:bg-blueprint"
            : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
        }
      >
        {cast.isPending ? "RECORDING…" : "RECORD VOTE"}
      </button>
    </form>
  );
}

function DecisionButton({
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
      className="group relative flex flex-col items-stretch gap-1 border p-3 text-left transition motion-reduce:transition-none"
      style={{
        borderColor: selected ? accent : "rgb(var(--ink-rgb) / 0.3)",
        boxShadow: selected ? `inset 0 0 0 2px ${accent}` : "none",
        background: selected ? "rgb(var(--bcc-white-rgb) / 0.4)" : "transparent",
      }}
    >
      <span
        className="bcc-stencil text-xl"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="font-serif text-ink-soft" style={{ fontSize: "13px" }}>
        {description}
      </span>
    </button>
  );
}

function YourCallLocked({
  decision,
  participation,
}: {
  decision: "accept" | "reject";
  participation: MyParticipationStatus | null;
}) {
  const accepted = decision === "accept";
  const accent = accepted ? "var(--verified)" : "var(--safety)";

  return (
    <section
      aria-label="Your vote on this case"
      className="border-2 p-5"
      style={{
        background: "var(--paper)",
        borderColor: accent,
      }}
    >
      <p className="bcc-mono text-cardstock-deep">YOUR CALL //</p>
      <p
        className="bcc-stencil mt-2 text-3xl"
        style={{ color: accent }}
      >
        {accepted ? "ACCEPT" : "REJECT"} · LOCKED
      </p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Sealed. The panel keeps deliberating; come back for the verdict.
      </p>

      {participation !== null && (
        <div className="mt-4 border-t border-dashed border-ink/20 pt-4">
          <p className="bcc-mono text-cardstock-deep">PANEL DUTY TODAY //</p>
          <p className="bcc-mono mt-1 text-ink">
            {participation.credited_today} VOTE
            {participation.credited_today === 1 ? "" : "S"} CREDITED ·{" "}
            {participation.earned_today.toFixed(2)}/
            {participation.caps.daily_trust.toFixed(2)} TRUST
          </p>
        </div>
      )}
    </section>
  );
}

function YourCallRecorded({ result }: { result: CastPanelVoteResponse }) {
  const accepted = result.decision === "accept";
  const accent = accepted ? "var(--verified)" : "var(--safety)";
  const credited = result.participation.credited;

  return (
    <section
      aria-label="Vote recorded"
      className="border-2 p-5"
      style={{
        background: "var(--paper)",
        borderColor: accent,
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }}
    >
      <p className="bcc-mono text-safety">VOTE RECORDED //</p>
      <p
        className="bcc-stencil mt-2 text-3xl"
        style={{ color: accent }}
      >
        YOU VOTED {accepted ? "ACCEPT" : "REJECT"}
      </p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Sealed. Tallies stay hidden until quorum.
      </p>

      <div className="mt-4 border-t border-dashed border-ink/20 pt-4">
        <p className="bcc-mono text-cardstock-deep">PARTICIPATION CREDIT //</p>
        <p
          className="bcc-stencil mt-1 text-xl"
          style={{ color: credited ? accent : "var(--ink)" }}
        >
          {credited ? "+1 CREDIT" : "NO CREDIT THIS TIME"}
        </p>
        <p
          className="mt-2 font-serif text-ink-soft"
          style={{ fontSize: "13px", lineHeight: 1.5 }}
        >
          {creditExplanation(credited, result.participation.reason)}
        </p>
        <p className="bcc-mono mt-3 text-ink-ghost">
          {result.participation.credited_today} TODAY ·{" "}
          {result.participation.credited_lifetime} LIFETIME
        </p>
      </div>
    </section>
  );
}

export function ReporterWaiting() {
  return (
    <section
      className="border-2 border-ink/30 p-5"
      style={{ background: "var(--paper)" }}
    >
      <p className="bcc-mono text-cardstock-deep">YOUR FILING //</p>
      <p className="bcc-stencil mt-2 text-2xl text-ink">ON THE FLOOR</p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Three panelists are weighing your case. You can&rsquo;t vote on
        your own dispute &mdash; the verdict will land here when quorum
        is reached.
      </p>
    </section>
  );
}

function creditExplanation(
  credited: boolean,
  reason: CastPanelVoteResponse["participation"]["reason"],
): string {
  if (credited) {
    return "Your accuracy is scored once the panel reaches a verdict. Correct calls add weight to your trust score; mis-calls don't penalize.";
  }
  switch (reason) {
    case "daily_cap":
      return "You've hit the daily trust cap from panel duty. Your vote still counts toward the verdict — credits resume tomorrow.";
    case "total_cap":
      return "You've earned the lifetime trust maximum from panel duty. Your vote still counts toward the verdict.";
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

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      not_assigned: "You're not on this dispute's panel.",
      already_voted: "You've already voted on this one.",
      invalid_decision: "Pick accept or reject.",
      dispute_closed: "This dispute resolved before your vote landed.",
      bcc_rate_limited: "Too many vote attempts — wait a moment.",
      bcc_forbidden: "You're not allowed to vote on this dispute.",
    },
    "Couldn't record your vote. Try again.",
  );
}
