"use client";

/**
 * OpenDisputeModal — §D5 file-a-dispute flow.
 *
 * Triggered from <DisputeCallout> on /v/[slug], /p/[slug], /c/[slug]
 * when the viewer is the page owner (server gate via card.permissions.
 * can_dispute). Two-step modal:
 *
 *   1. Pick — list disputable downvotes on this page (server returns
 *             upvotes too for context; UI disables them with copy).
 *   2. Reason — textarea (20..1000 chars) + optional evidence URL.
 *
 * On success: invalidate the disputable-votes query (the row drops off
 * the picker because already_disputed flips to true server-side) and
 * the user's profile dispute tab so the new entry surfaces. Toast the
 * server's confirmation message verbatim.
 *
 * Constraints we enforce client-side AHEAD of the server (better UX,
 * not a security gate):
 *   - downvotes only (server 400s on upvote)
 *   - reason length 20..1000 (server 400s outside)
 *   - evidence_url is optional; trimmed empty → omitted
 *
 * The 60s submit throttle is server-enforced; we don't replicate it
 * client-side beyond disabling the button while the request is in flight.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DISPUTABLE_VOTES_QUERY_KEY_ROOT,
  useDisputableVotes,
  useOpenDispute,
} from "@/hooks/useDisputes";
import { USER_DISPUTES_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import { humanizeCode } from "@/lib/api/errors";
import {
  DISPUTE_PANEL_SIZE,
  DISPUTE_REASON_MAX_LENGTH,
  DISPUTE_REASON_MIN_LENGTH,
  type DisputableVote,
} from "@/lib/api/types";

interface OpenDisputeModalProps {
  pageId: number;
  pageName: string;
  onClose: () => void;
}

export function OpenDisputeModal({
  pageId,
  pageName,
  onClose,
}: OpenDisputeModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const votesQuery = useDisputableVotes(pageId);
  const submit = useOpenDispute();

  const [selectedVote, setSelectedVote] = useState<DisputableVote | null>(null);
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const downvotes = (votesQuery.data ?? []).filter(
    (v) => v.vote_type === "downvote",
  );
  const disputableDownvotes = downvotes.filter((v) => !v.already_disputed);

  const reasonTrimmed = reason.trim();
  const reasonLength = reasonTrimmed.length;
  const reasonTooShort = reasonLength < DISPUTE_REASON_MIN_LENGTH;
  const reasonTooLong = reason.length > DISPUTE_REASON_MAX_LENGTH;

  const evidenceTrimmed = evidenceUrl.trim();
  const canSubmit =
    selectedVote !== null &&
    !reasonTooShort &&
    !reasonTooLong &&
    !submit.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || selectedVote === null) return;
    setError(null);
    try {
      await submit.mutateAsync({
        vote_id: selectedVote.id,
        reason: reasonTrimmed,
        ...(evidenceTrimmed !== "" ? { evidence_url: evidenceTrimmed } : {}),
      });
      // Drop the picker cache for this page so already_disputed flips,
      // and the user's profile dispute tab so the new row surfaces. The
      // /v/{slug} surface is server-rendered, so router.refresh re-pulls
      // the card view-model with refreshed permissions.
      void queryClient.invalidateQueries({
        queryKey: [...DISPUTABLE_VOTES_QUERY_KEY_ROOT, pageId],
      });
      void queryClient.invalidateQueries({
        queryKey: USER_DISPUTES_QUERY_KEY_ROOT,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  return (
    <ModalShell
      title={`Open a dispute on ${pageName}`}
      onClose={() => {
        if (!submit.isPending) onClose();
      }}
    >
      <header className="mb-5">
        <p className="bcc-mono text-safety">OPEN A DISPUTE //</p>
        <h3 className="bcc-stencil mt-1 text-3xl text-ink">
          {pageName}
        </h3>
        <p className="mt-2 max-w-prose font-serif text-ink-soft">
          Flag a downvote you believe is invalid. {DISPUTE_PANEL_SIZE} panelists
          will review the evidence and decide. Disputes are public and
          permanent — file when you have grounds, not just disagreement.
        </p>
      </header>

      {votesQuery.isPending && (
        <div className="bcc-paper p-6">
          <p className="bcc-mono text-ink-soft">Loading downvotes…</p>
        </div>
      )}

      {votesQuery.isError && (
        <div className="bcc-paper p-6">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load votes for this page: {votesQuery.error.message}
          </p>
        </div>
      )}

      {votesQuery.isSuccess && downvotes.length === 0 && (
        <div className="bcc-paper p-6 text-center">
          <p className="bcc-mono mb-2 text-cardstock-deep">CLEAN SLATE</p>
          <h4 className="bcc-stencil text-2xl text-ink">
            No downvotes to dispute.
          </h4>
          <p className="mt-2 font-serif italic text-ink-soft">
            Only downvotes are disputable. Your page hasn&apos;t taken any.
          </p>
        </div>
      )}

      {votesQuery.isSuccess && downvotes.length > 0 && (
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-col gap-5"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="bcc-mono mb-2 text-cardstock-deep">
              PICK THE DOWNVOTE //
            </legend>
            <ul
              className="flex flex-col gap-2"
              role="radiogroup"
              aria-label="Downvotes you can dispute"
            >
              {downvotes.map((vote) => (
                <li key={vote.id}>
                  <VoteOption
                    vote={vote}
                    selected={selectedVote?.id === vote.id}
                    disabled={vote.already_disputed}
                    onSelect={() => {
                      if (!vote.already_disputed) setSelectedVote(vote);
                    }}
                  />
                </li>
              ))}
            </ul>
            {disputableDownvotes.length === 0 && (
              <p className="bcc-mono mt-1 text-cardstock-deep">
                Every downvote on this page already has an active dispute.
              </p>
            )}
          </fieldset>

          <div>
            <label
              htmlFor="dispute-reason"
              className="bcc-mono mb-2 block text-cardstock-deep"
            >
              YOUR REASON //
              <span className="ml-2 text-ink-ghost">
                ({DISPUTE_REASON_MIN_LENGTH}–{DISPUTE_REASON_MAX_LENGTH} chars)
              </span>
            </label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              maxLength={DISPUTE_REASON_MAX_LENGTH}
              placeholder="What's wrong with this downvote? Be specific — panelists need facts, not feelings."
              className="bcc-panel w-full p-3 font-serif text-ink"
              style={{ resize: "vertical" }}
            />
            <div className="bcc-mono mt-1 flex items-center justify-between text-[10px] tracking-[0.18em]">
              <span
                className={
                  reasonTooShort
                    ? "text-cardstock-deep"
                    : "text-ink-soft"
                }
              >
                {reasonTooShort
                  ? `${DISPUTE_REASON_MIN_LENGTH - reasonLength} more characters`
                  : "READY"}
              </span>
              <span
                className={
                  reasonTooLong
                    ? "text-safety"
                    : reasonLength > DISPUTE_REASON_MAX_LENGTH - 100
                      ? "text-weld"
                      : "text-cardstock-deep"
                }
              >
                {reasonLength}/{DISPUTE_REASON_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="dispute-evidence"
              className="bcc-mono mb-2 block text-cardstock-deep"
            >
              EVIDENCE URL //
              <span className="ml-2 text-ink-ghost">(optional)</span>
            </label>
            <input
              id="dispute-evidence"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://… link a tx, screenshot, or document panelists should see"
              className="bcc-panel w-full p-3 font-serif text-ink"
              maxLength={2083}
            />
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
              disabled={submit.isPending}
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
              {submit.isPending ? "FILING…" : "OPEN DISPUTE"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// VoteOption — one row in the picker. Uses radio semantics for the
// selection (single choice). already_disputed votes are disabled and
// labelled so the owner sees why they can't pick that one.
// ─────────────────────────────────────────────────────────────────────

function VoteOption({
  vote,
  selected,
  disabled,
  onSelect,
}: {
  vote: DisputableVote;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={onSelect}
      disabled={disabled}
      className={
        "bcc-paper w-full p-3 text-left transition " +
        (selected
          ? "ring-2 ring-safety"
          : disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:ring-1 hover:ring-cardstock-edge")
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-stencil text-ink">{vote.voter_name}</span>
        <span className="bcc-mono text-cardstock-deep">
          weight {vote.weight.toFixed(2)}
          {disabled && " · ALREADY DISPUTED"}
        </span>
      </div>
      {vote.reason !== "" && (
        <p className="mt-1 font-serif italic text-ink-soft">
          &ldquo;{vote.reason}&rdquo;
        </p>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ModalShell — same idiom as Composer's modal variant. Kept local until the
// design system grows a real <Dialog> primitive.
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
// Error humanizer — typed mapping per §L2. Surfaces the controller's
// known error codes verbatim where they're already user-friendly,
// translates the rest to action-oriented copy.
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      not_page_owner: "Only the page owner can open disputes.",
      upvote_not_disputable: "Only downvotes can be disputed.",
      already_disputed: "This vote already has an active dispute.",
      insufficient_panelists:
        "Not enough qualified panelists are online right now. Try again shortly.",
      dispute_limit_reached:
        "This page has hit its dispute limit. Wait for an existing dispute to resolve.",
      reporter_limit_reached:
        "You have too many open disputes. Wait for one to resolve before filing another.",
      vote_no_longer_active:
        "That vote was removed before the dispute landed. Refresh and pick another.",
      dispute_subsystem_unhealthy:
        "Dispute filing is temporarily unavailable. An operator has been notified.",
      db_transient: "Connection blip — please try again.",
      bcc_rate_limited: "Too many dispute attempts — wait a moment.",
    },
    "Couldn't file the dispute. Try again.",
  );
}