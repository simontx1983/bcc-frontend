"use client";

/**
 * F-345 — the received-reviews list's reply UI (CardReviewsPanel): the
 * composer, Edit / Delete, and Report around the read-only ReviewReplyView.
 *
 * Every control is gated on a server permission and nothing else:
 * `review.permissions.can_reply` for the composer, `reply.permissions.
 * can_edit | can_delete | can_report` for the rest. The client never
 * compares the reply author with the viewer — after a page changes hands
 * the old author may delete but not edit, which only the server knows.
 *
 * Each write hook mounts only while its control is open, so a plain row
 * (the common case: no permissions) runs no mutation observers.
 *
 * One reply, no thread: a reply takes no comments and no reactions.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ReportModal } from "@/components/feed/ReportButton";
import { ReviewReplyView } from "@/components/review/ReviewReplyView";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useCreateReviewReply,
  useDeleteReviewReply,
  useUpdateReviewReply,
} from "@/hooks/useReviewReply";
import { humanizeCode } from "@/lib/api/errors";
import type { CardReview } from "@/lib/api/types";
import { unlockHint } from "@/lib/permissions";

/** Server cap (contract: 1–1000 chars after trim). */
const REVIEW_REPLY_MAX_LENGTH = 1000;

/**
 * `reply.feed_id` ("feed_<n>") → the bare number POST /me/reports takes as
 * a `feed_item` target. Anchored and digits-only; 0 when unusable, so the
 * Report control withholds itself rather than sending a malformed body.
 */
export function replyReportTargetId(feedId: string): number {
  const match = /^feed_(\d+)$/.exec(feedId);
  if (match === null) return 0;
  const n = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

const ACTION_CLASS =
  "bcc-mono inline-flex min-h-[44px] items-center px-2 text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50";
const ACTION_STYLE = { fontSize: "10px", letterSpacing: "0.18em" } as const;

// Shared by create + edit; each adds its own 403/404/409 meaning below.
// 503 is retryable — including while another create on the same review is
// in flight server-side.
const WRITE_ERROR_COPY: Record<string, string> = {
  bcc_unauthorized: "Sign in to reply.",
  bcc_invalid_request: `A reply needs 1 to ${REVIEW_REPLY_MAX_LENGTH} characters.`,
  bcc_rate_limited: "Too many replies in a short time. Try again in a few minutes.",
  bcc_unavailable: "Replies are temporarily unavailable. Try again shortly.",
};

export function ReviewReplySection({ review }: { review: CardReview }) {
  const reply = review.reply ?? null;
  const [mode, setMode] = useState<"idle" | "compose" | "edit">("idle");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reporting, setReporting] = useState(false);

  // `reply === null` as well: right after a create the row already holds
  // the new reply while `can_reply` is still being refetched.
  const canReply = review.permissions?.can_reply?.allowed === true && reply === null;
  const perms = reply?.permissions;
  const canEdit = perms?.can_edit.allowed === true;
  const canDelete = perms?.can_delete.allowed === true;
  const reportTarget = reply !== null ? replyReportTargetId(reply.feed_id) : 0;
  const canReport = perms?.can_report.allowed === true && reportTarget !== 0;
  // §N7: a denial the viewer can act on (sign in) shows disabled with its
  // hint; a structural one (null hint, e.g. your own reply) hides.
  const reportHint = canReport ? null : unlockHint(perms, "can_report");

  if (reply === null) {
    if (!canReply) return null;
    if (mode !== "compose") {
      return (
        <div className="mt-2">
          <button type="button" className={ACTION_CLASS} style={ACTION_STYLE} onClick={() => setMode("compose")}>
            REPLY
          </button>
        </div>
      );
    }
    return <CreateReply reviewId={review.id} onDone={() => setMode("idle")} />;
  }

  if (mode === "edit" && canEdit) {
    return <EditReply reviewId={review.id} initial={reply.body} onDone={() => setMode("idle")} />;
  }

  const hintId = `reply-report-hint-${reply.id}`;
  const hasControls = canEdit || canDelete || canReport || reportHint !== null;

  return (
    <>
      <ReviewReplyView reply={reply} surface="paper">
        {hasControls && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            {canEdit && (
              <button type="button" className={ACTION_CLASS} style={ACTION_STYLE} onClick={() => setMode("edit")}>
                EDIT
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={ACTION_CLASS}
                style={ACTION_STYLE}
                onClick={() => setConfirmingDelete(true)}
              >
                DELETE
              </button>
            )}
            {canReport && (
              <button
                type="button"
                className={ACTION_CLASS}
                style={ACTION_STYLE}
                aria-label="Report this reply"
                onClick={() => setReporting(true)}
              >
                REPORT
              </button>
            )}
            {!canReport && reportHint !== null && (
              <>
                <button
                  type="button"
                  disabled
                  aria-describedby={hintId}
                  aria-label="Report this reply"
                  className={ACTION_CLASS}
                  style={ACTION_STYLE}
                >
                  REPORT
                </button>
                <span id={hintId} className="bcc-mono text-ink-ghost" style={{ fontSize: "10px" }}>
                  {reportHint}
                </span>
              </>
            )}
          </div>
        )}
      </ReviewReplyView>

      {confirmingDelete && (
        <DeleteReplyDialog reviewId={review.id} onDone={() => setConfirmingDelete(false)} />
      )}

      {reporting && (
        <ReportModal
          targetKind="feed_item"
          targetId={reportTarget}
          subjectLabel="reply"
          onClose={() => setReporting(false)}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Write containers — each owns its mutation, mounted only while open.
// ──────────────────────────────────────────────────────────────────────

function CreateReply({ reviewId, onDone }: { reviewId: number; onDone: () => void }) {
  const mut = useCreateReviewReply();
  return (
    <ReplyComposer
      reviewId={reviewId}
      initial=""
      submitLabel="POST REPLY"
      pending={mut.isPending}
      errorMessage={
        mut.error
          ? humanizeCode(
              mut.error,
              {
                ...WRITE_ERROR_COPY,
                bcc_forbidden: "You can’t reply to this review.",
                bcc_not_found: "This review is no longer available.",
                bcc_conflict: "You’ve already replied to this review.",
              },
              "Couldn’t post your reply. Try again in a moment.",
            )
          : null
      }
      onSubmit={(body) => mut.mutate({ reviewId, body }, { onSuccess: onDone })}
      onCancel={onDone}
    />
  );
}

function EditReply({
  reviewId,
  initial,
  onDone,
}: {
  reviewId: number;
  initial: string;
  onDone: () => void;
}) {
  const mut = useUpdateReviewReply();
  return (
    <ReplyComposer
      reviewId={reviewId}
      initial={initial}
      submitLabel="SAVE"
      pending={mut.isPending}
      errorMessage={
        mut.error
          ? humanizeCode(
              mut.error,
              {
                ...WRITE_ERROR_COPY,
                // 403 on PATCH = you no longer answer for this page.
                bcc_forbidden: "You can no longer edit this reply.",
                bcc_not_found: "This reply is no longer available.",
              },
              "Couldn’t save your reply. Try again in a moment.",
            )
          : null
      }
      onSubmit={(body) => mut.mutate({ reviewId, body }, { onSuccess: onDone })}
      onCancel={onDone}
    />
  );
}

function DeleteReplyDialog({ reviewId, onDone }: { reviewId: number; onDone: () => void }) {
  const mut = useDeleteReviewReply();
  return (
    <ConfirmDialog
      title="Delete your reply?"
      body="It will be removed from this review."
      confirmLabel="DELETE"
      cancelLabel="CANCEL"
      retryLabel="TRY AGAIN"
      errorMessage={
        mut.error
          ? humanizeCode(
              mut.error,
              {
                // No 403 on DELETE: deleting your own reply is never gated.
                bcc_not_found: "This reply is already gone.",
                bcc_unavailable: "Replies are temporarily unavailable. Try again shortly.",
              },
              "Couldn’t delete your reply. Try again in a moment.",
            )
          : null
      }
      pending={mut.isPending}
      onConfirm={() => {
        mut.reset();
        mut.mutate({ reviewId }, { onSuccess: onDone });
      }}
      onCancel={onDone}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// Composer (create + edit)
// ──────────────────────────────────────────────────────────────────────

function ReplyComposer({
  reviewId,
  initial,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
  onCancel,
}: {
  reviewId: number;
  initial: string;
  submitLabel: string;
  pending: boolean;
  errorMessage: string | null;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  // Belt-and-braces with `disabled`: a second click landing before the
  // re-render that disables the button must not send a second write
  // (the server's one-reply check is racy).
  const inFlight = useRef(false);
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending]);

  const trimmed = draft.trim();
  const tooLong = trimmed.length > REVIEW_REPLY_MAX_LENGTH;
  const unchanged = initial !== "" && trimmed === initial.trim();
  const canSubmit = trimmed.length > 0 && !tooLong && !unchanged && !pending;
  const fieldId = `review-reply-${reviewId}`;
  const errorId = `${fieldId}-error`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={submit} className="mt-3 border-l-2 border-ink/20 pl-3">
      <label htmlFor={fieldId} className="sr-only">
        Your reply
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        // Hard cap a little above the server's so a paste is not silently
        // cut; the counter and `canSubmit` enforce the real limit.
        maxLength={REVIEW_REPLY_MAX_LENGTH + 200}
        disabled={pending}
        aria-invalid={tooLong || errorMessage !== null}
        aria-describedby={errorMessage !== null ? errorId : undefined}
        placeholder="Write your reply…"
        className="w-full rounded-[4px] border border-ink/25 bg-transparent px-4 py-3 font-serif text-ink placeholder:text-ink-ghost"
        style={{ fontSize: "16px", lineHeight: 1.5 }}
      />
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        <button type="submit" disabled={!canSubmit} className={ACTION_CLASS} style={ACTION_STYLE}>
          {pending ? "SAVING…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={ACTION_CLASS} style={ACTION_STYLE}>
          CANCEL
        </button>
        <span
          className={`bcc-mono ml-auto ${tooLong ? "text-ink" : "text-ink-ghost"}`}
          style={{ fontSize: "10px" }}
          aria-live="polite"
        >
          {trimmed.length}/{REVIEW_REPLY_MAX_LENGTH}
        </span>
      </div>
      {errorMessage !== null && (
        <p id={errorId} role="alert" className="mt-1 font-serif text-ink" style={{ fontSize: "13px" }}>
          {errorMessage}
        </p>
      )}
    </form>
  );
}
