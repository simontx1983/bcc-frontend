"use client";

/**
 * ReportButton + ReportModal — §K1 Phase B inline content reporting.
 *
 * Renders a small "Report" link on each FeedItemCard footer. Clicking
 * opens a modal with a reason picker + optional comment + submit. After
 * a successful submit (or "existing" idempotent reply) the modal shows
 * a thank-you state for ~1.4s then auto-closes.
 *
 * Permissions: hidden when `permissions.can_report.allowed === false`.
 * Server is the source of truth — this is just visibility hygiene.
 *
 * No portal: the modal renders inline as a fixed-position overlay so we
 * don't need a portal root. ESC + backdrop-click both close.
 */

import { useEffect, useState } from "react";

import { useReportContent } from "@/hooks/useReportContent";
import {
  type BccApiError,
  CONTENT_REPORT_COMMENT_MAX_LENGTH,
  type ContentReportReason,
  type ContentReportTargetKind,
  type FeedItem,
} from "@/lib/api/types";

interface ReportButtonProps {
  item: FeedItem;
}

export function ReportButton({ item }: ReportButtonProps) {
  const canReport = item.permissions["can_report"]?.allowed === true;

  const [open, setOpen] = useState(false);

  if (!canReport) {
    return null;
  }

  const targetId = resolveTargetId(item);
  if (targetId === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bcc-mono shrink-0 text-[10px] text-ink-soft/70 hover:text-safety hover:underline"
      >
        Report
      </button>
      {open && (
        <ReportModal
          targetKind="feed_item"
          targetId={targetId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * The peepso_activities act_id is what the server's report endpoint
 * expects. Feed items expose it via `id` ("feed_<actId>") because
 * `external_id` is the module-specific FK (vote_id for reviews,
 * batch_id for pulls, etc.) — that's the wrong identifier here.
 */
function resolveTargetId(item: FeedItem): number {
  if (item.id.startsWith("feed_")) {
    const parsed = Number.parseInt(item.id.slice("feed_".length), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────

interface ReportModalProps {
  targetKind: ContentReportTargetKind;
  targetId: number;
  onClose: () => void;
}

interface ReasonOption {
  code: ContentReportReason;
  label: string;
  blurb: string;
  /** True when a comment is server-required (mirrors REASONS_REQUIRING_COMMENT). */
  requiresComment: boolean;
}

const REASONS: ReasonOption[] = [
  { code: "spam",            label: "Spam",            blurb: "Repetitive, off-topic, or commercial.",         requiresComment: false },
  { code: "harassment",      label: "Harassment",      blurb: "Targeted abuse, bullying, or threats.",         requiresComment: false },
  { code: "hate",            label: "Hate",            blurb: "Slurs or discrimination based on identity.",    requiresComment: false },
  { code: "violence",        label: "Violence",        blurb: "Threats, incitement, graphic violence.",        requiresComment: false },
  { code: "misinformation",  label: "Misinformation",  blurb: "Knowingly false claims about chains, validators, or projects.", requiresComment: false },
  { code: "other",           label: "Other",           blurb: "Tell us what happened in the comment.",         requiresComment: true  },
];

function ReportModal({ targetKind, targetId, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submittedState, setSubmittedState] = useState<"created" | "existing" | null>(null);

  const mutation = useReportContent({
    onSuccess: (data) => {
      setErrorText(null);
      setSubmittedState(data.status);
    },
    onError: (err) => {
      setErrorText(humanizeError(err));
    },
  });

  // ESC closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-close after the thank-you state.
  useEffect(() => {
    if (submittedState === null) return;
    const t = window.setTimeout(onClose, 1_400);
    return () => window.clearTimeout(t);
  }, [submittedState, onClose]);

  const reasonSpec = reason !== null ? REASONS.find((r) => r.code === reason) : null;
  const commentRequired = reasonSpec?.requiresComment === true;
  const trimmedComment = comment.trim();
  const overCap = comment.length > CONTENT_REPORT_COMMENT_MAX_LENGTH;
  const canSubmit =
    reason !== null &&
    !overCap &&
    !mutation.isPending &&
    submittedState === null &&
    (!commentRequired || trimmedComment !== "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || reason === null) return;
    setErrorText(null);
    mutation.mutate({
      target_kind: targetKind,
      target_id: targetId,
      reason_code: reason,
      ...(trimmedComment !== "" ? { comment: trimmedComment } : {}),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bcc-report-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center px-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />

      {/* Panel — capped at 90vh on short phones so the 6 reasons + body
          textarea + buttons stay reachable via inner scroll instead of
          spilling off-screen. */}
      <div className="bcc-panel relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto p-6">
        {submittedState !== null ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <h2
              id="bcc-report-modal-title"
              className="bcc-stencil text-2xl text-ink"
            >
              Thank you.
            </h2>
            <p className="bcc-mono text-[11px] tracking-[0.18em] text-ink-soft">
              {submittedState === "existing"
                ? "ALREADY ON FILE"
                : "REPORT SUBMITTED"}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <header className="flex items-baseline justify-between gap-3">
              <h2
                id="bcc-report-modal-title"
                className="bcc-stencil text-xl text-ink"
              >
                Report this post
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft hover:text-ink"
              >
                CLOSE
              </button>
            </header>

            <fieldset className="flex flex-col gap-2">
              <legend className="bcc-mono mb-1 text-[10px] tracking-[0.24em] text-ink-soft">
                REASON
              </legend>
              {REASONS.map((opt) => {
                const checked = reason === opt.code;
                return (
                  <label
                    key={opt.code}
                    className={
                      "flex cursor-pointer items-start gap-3 border-2 px-3 py-2 transition " +
                      (checked
                        ? "border-ink bg-ink/5"
                        : "border-cardstock-edge hover:border-ink/40")
                    }
                  >
                    <input
                      type="radio"
                      name="bcc-report-reason"
                      value={opt.code}
                      checked={checked}
                      onChange={() => setReason(opt.code)}
                      className="mt-1"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-serif text-ink">{opt.label}</span>
                      <span className="bcc-mono text-[10px] text-ink-soft">
                        {opt.blurb}
                      </span>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            <label className="flex flex-col gap-1">
              <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
                COMMENT {commentRequired ? "(required)" : "(optional)"}
              </span>
              <textarea
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  if (errorText !== null) setErrorText(null);
                }}
                rows={3}
                maxLength={CONTENT_REPORT_COMMENT_MAX_LENGTH + 100}
                placeholder={
                  commentRequired
                    ? "What's wrong with this post?"
                    : "Add context if it helps."
                }
                className="bcc-mono w-full resize-y rounded-sm border border-cardstock-edge/60 bg-cardstock/30 px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none"
              />
              <span
                className={
                  "bcc-mono text-[10px] " +
                  (overCap ? "text-safety" : "text-ink-soft")
                }
              >
                {comment.length} / {CONTENT_REPORT_COMMENT_MAX_LENGTH}
              </span>
            </label>

            {errorText !== null && (
              <p role="alert" className="bcc-mono text-[11px] text-safety">
                {errorText}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bcc-mono border-2 border-cardstock-edge px-4 py-2 text-[11px] tracking-[0.18em] text-ink-soft hover:border-ink/50 hover:text-ink"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className={
                  "bcc-stencil rounded-sm px-5 py-2 text-[12px] tracking-[0.2em] transition " +
                  (canSubmit
                    ? "bg-ink text-cardstock hover:bg-blueprint"
                    : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
                }
              >
                {mutation.isPending ? "Sending…" : "SUBMIT REPORT"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function humanizeError(err: BccApiError): string {
  switch (err.code) {
    case "bcc_unauthorized":
      return "Sign in to report.";
    case "bcc_invalid_request":
      return err.message || "Check the form and try again.";
    case "bcc_rate_limited":
      return "Too many reports just now. Wait a moment, then retry.";
    case "bcc_unavailable":
      return "Reports are temporarily unavailable. Try again shortly.";
    default:
      return err.message || "Couldn't file the report. Try again.";
  }
}
