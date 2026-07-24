"use client";

/**
 * ReportMemberModal — member-report dialog wired to POST /report-user
 * (api-contract §4.27). Opened from the REPORT action in
 * AttestationActionCluster on a member profile (`/u/[handle]`).
 *
 * Mirrors the content-report ReportModal (components/feed/ReportButton.tsx)
 * with three differences driven by the §4.27 contract:
 *   1. Targets a member (`reported_user_id`), not a feed_item.
 *   2. Reason enum differs (fraud / inappropriate / impersonation in
 *      place of hate / violence).
 *   3. No idempotent success status — the endpoint returns only
 *      `{ message }`. Success → "REPORT SUBMITTED"; the "already filed"
 *      case comes back as the `already_reported` error code (409), which
 *      we render as a friendly terminal "ALREADY ON FILE" state rather
 *      than an error.
 *
 * No portal: renders inline as a fixed-position overlay. ESC +
 * backdrop-click both close. Auto-closes ~1.4s after the thank-you
 * state. Reduced-motion safe (no animation here; transitions are
 * motion-gated globally).
 */

import { useEffect, useState } from "react";

import { useReportUser } from "@/hooks/useReportUser";
import { humanizeCode } from "@/lib/api/errors";
import {
  USER_REPORT_DETAIL_MAX_LENGTH,
  type UserReportReason,
} from "@/lib/api/types";

interface ReportMemberModalProps {
  reportedUserId: number;
  onClose: () => void;
}

interface ReasonOption {
  code: UserReportReason;
  label: string;
  blurb: string;
  /** True when reason_detail is server-required (reason_key === "other"). */
  requiresDetail: boolean;
}

const REASONS: ReasonOption[] = [
  { code: "spam",           label: "Spam",           blurb: "Repetitive, off-topic, or commercial.",            requiresDetail: false },
  { code: "harassment",     label: "Harassment",     blurb: "Targeted abuse, bullying, or threats.",            requiresDetail: false },
  { code: "fraud",          label: "Fraud",          blurb: "Scams, fake operators, or deceptive claims.",      requiresDetail: false },
  { code: "misinformation", label: "Misinformation", blurb: "Knowingly false claims about chains or operators.", requiresDetail: false },
  { code: "inappropriate",  label: "Inappropriate",  blurb: "Content that doesn't belong on the floor.",        requiresDetail: false },
  { code: "impersonation",  label: "Impersonation",  blurb: "Pretending to be someone they're not.",            requiresDetail: false },
  { code: "other",          label: "Other",          blurb: "Tell us what happened in the description.",        requiresDetail: true  },
];

export function ReportMemberModal({ reportedUserId, onClose }: ReportMemberModalProps) {
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submittedState, setSubmittedState] = useState<"created" | "existing" | null>(null);

  const mutation = useReportUser({
    onSuccess: () => {
      setErrorText(null);
      setSubmittedState("created");
    },
    onError: (err) => {
      // `already_reported` (409) isn't a failure — the report is on file.
      // Surface the same friendly terminal state as a fresh submit.
      if (err.code === "already_reported") {
        setErrorText(null);
        setSubmittedState("existing");
        return;
      }
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
  const detailRequired = reasonSpec?.requiresDetail === true;
  const trimmedDetail = detail.trim();
  const overCap = detail.length > USER_REPORT_DETAIL_MAX_LENGTH;
  const canSubmit =
    reason !== null &&
    !overCap &&
    !mutation.isPending &&
    submittedState === null &&
    (!detailRequired || trimmedDetail !== "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || reason === null) return;
    setErrorText(null);
    mutation.mutate({
      reported_user_id: reportedUserId,
      reason_key: reason,
      ...(trimmedDetail !== "" ? { reason_detail: trimmedDetail } : {}),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bcc-report-member-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center px-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />

      <div className="bcc-panel relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto p-4 sm:p-6">
        {submittedState !== null ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <h2
              id="bcc-report-member-modal-title"
              className="bcc-stencil text-2xl text-bcc-text"
            >
              Thank you.
            </h2>
            <p className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text-secondary">
              {submittedState === "existing" ? "ALREADY ON FILE" : "REPORT SUBMITTED"}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <header className="flex items-baseline justify-between gap-3">
              <h2
                id="bcc-report-member-modal-title"
                className="bcc-stencil text-xl text-bcc-text"
              >
                Report this member
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text"
              >
                CLOSE
              </button>
            </header>

            <fieldset className="flex flex-col gap-2">
              <legend className="bcc-mono mb-1 text-[10px] tracking-[0.24em] text-bcc-text-secondary">
                REASON
              </legend>
              {REASONS.map((opt) => {
                const checked = reason === opt.code;
                return (
                  <label
                    key={opt.code}
                    className={
                      "flex min-h-[44px] cursor-pointer items-start gap-3 border-2 px-3 py-2 transition " +
                      (checked
                        ? "border-bcc-accent bg-bcc-surface-hover"
                        : "border-bcc-border hover:border-bcc-border-strong")
                    }
                  >
                    <input
                      type="radio"
                      name="bcc-report-member-reason"
                      value={opt.code}
                      checked={checked}
                      onChange={() => setReason(opt.code)}
                      className="mt-1"
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-serif text-bcc-text">{opt.label}</span>
                      <span className="bcc-mono text-[10px] text-bcc-text-secondary">
                        {opt.blurb}
                      </span>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            <label className="flex flex-col gap-1">
              <span className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
                DESCRIPTION {detailRequired ? "(required)" : "(optional)"}
              </span>
              <textarea
                value={detail}
                onChange={(e) => {
                  setDetail(e.target.value);
                  if (errorText !== null) setErrorText(null);
                }}
                rows={3}
                maxLength={USER_REPORT_DETAIL_MAX_LENGTH + 100}
                placeholder={
                  detailRequired
                    ? "What did this member do?"
                    : "Add context if it helps."
                }
                className="bcc-mono w-full resize-y rounded-sm border border-bcc-input-border bg-bcc-input-bg px-3 py-2 text-bcc-text placeholder:text-bcc-text-placeholder focus:border-bcc-accent focus:outline-none focus:ring-1 focus:ring-bcc-accent"
              />
              <span
                className={
                  "bcc-mono text-[10px] " + (overCap ? "text-safety" : "text-bcc-text-secondary")
                }
              >
                {detail.length} / {USER_REPORT_DETAIL_MAX_LENGTH}
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
                className="bcc-mono border-2 border-bcc-border px-4 py-2 text-[11px] tracking-[0.18em] text-bcc-text-secondary hover:border-bcc-border-strong hover:text-bcc-text"
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
                    : "cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted")
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

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to report.",
      bcc_rate_limited: "Too many reports just now. Wait a moment, then retry.",
      report_limit_reached: "You've hit today's report limit. Try again later.",
      target_report_limit: "This member already has reports under review.",
      cannot_self_report: "You can't report yourself.",
      user_not_found: "That member no longer exists.",
      detail_required: "Add a short description for this report.",
      db_error: "Couldn't file the report. Try again.",
    },
    "Couldn't file the report. Try again.",
  );
}
