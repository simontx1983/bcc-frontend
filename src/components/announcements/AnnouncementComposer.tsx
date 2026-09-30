"use client";

/**
 * Validator announcement composer — Dialog-hosted.
 *
 * Three modes, one form: save a **draft**, **publish now**, or
 * **schedule** for a future instant.
 *
 * Client-side length and date checks here are **UX, not a gate**. The
 * server owns every rule: it stamps publication time from its own clock,
 * rejects a `publish_at` that is not strictly in the future, refuses
 * backdating, and re-resolves ownership before anything becomes public.
 * Mirrors the posture documented in OpenDisputeModal.
 *
 * The component never decides who may compose — it is only mounted when
 * the server's capability block granted `can_create`.
 */

import { useId, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { humanizeCode } from "@/lib/api/errors";
import type {
  AnnouncementPublishMode,
  CreateAnnouncementRequest,
} from "@/lib/api/types";

/** Contract bounds (§4.32.3). Mirrored for UX; the server re-checks all three. */
export const ANNOUNCEMENT_TITLE_MAX = 200;
export const ANNOUNCEMENT_SUMMARY_MAX = 300;
export const ANNOUNCEMENT_BODY_MAX = 20_000;

interface AnnouncementComposerProps {
  onClose: () => void;
  onSubmit: (request: CreateAnnouncementRequest) => Promise<unknown>;
  pending: boolean;
  error: unknown;
}

/**
 * `datetime-local` yields wall-clock text with no zone. Interpreting it
 * in the viewer's own zone and sending UTC is the only reading that
 * matches what the operator saw in the field.
 */
function localInputToUtcIso(value: string): string | null {
  if (value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function AnnouncementComposer({
  onClose,
  onSubmit,
  pending,
  error,
}: AnnouncementComposerProps) {
  const titleId = useId();
  const summaryId = useId();
  const bodyId = useId();
  const dateId = useId();
  const commentsId = useId();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<AnnouncementPublishMode>("publish");
  const [publishAtLocal, setPublishAtLocal] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [touched, setTouched] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedSummary = summary.trim();
  const trimmedBody = body.trim();
  const publishAtIso = localInputToUtcIso(publishAtLocal);

  // Summary is validated on its own so a missing summary can never be
  // masked by a title or body problem — it is a first-class field.
  const summaryMissing = trimmedSummary === "";
  const scheduleNeedsFutureDate =
    mode === "schedule" && (publishAtIso === null || Date.parse(publishAtIso) <= Date.now());

  const blocked =
    trimmedTitle === "" ||
    summaryMissing ||
    trimmedBody === "" ||
    trimmedTitle.length > ANNOUNCEMENT_TITLE_MAX ||
    trimmedSummary.length > ANNOUNCEMENT_SUMMARY_MAX ||
    trimmedBody.length > ANNOUNCEMENT_BODY_MAX ||
    scheduleNeedsFutureDate;

  const failureCopy = humanizeCode(
    error,
    {
      bcc_forbidden: "You're not the verified operator of this validator any more.",
      bcc_invalid_request: "Check the title, summary, body and publication time.",
      bcc_rate_limited: "Posting too fast — give it a moment and try again.",
      bcc_unauthorized: "Sign in again to post this announcement.",
    },
    "Couldn't post this announcement. Try again in a moment.",
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (blocked || pending) return;

    const request: CreateAnnouncementRequest = {
      title: trimmedTitle,
      summary: trimmedSummary,
      body: trimmedBody,
      mode,
      comments_enabled: commentsEnabled,
    };
    if (mode === "schedule" && publishAtIso !== null) {
      request.publish_at = publishAtIso;
    }
    void onSubmit(request);
  }

  return (
    <Dialog
      title="New announcement"
      onClose={onClose}
      closeDisabled={pending}
      panelClassName="max-w-2xl max-h-[92vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="bcc-stencil text-bcc-text" style={{ fontSize: "24px" }}>
          New announcement
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor={titleId} className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "11px" }}>
            TITLE
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            disabled={pending}
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={summaryId} className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "11px" }}>
            SUMMARY (REQUIRED)
          </label>
          <textarea
            id={summaryId}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={ANNOUNCEMENT_SUMMARY_MAX}
            rows={2}
            disabled={pending}
            aria-describedby={`${summaryId}-help`}
            aria-invalid={touched && summaryMissing}
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
          />
          {/* Readable help text, so it takes the SECONDARY token, not
              --bcc-text-muted: that one measures 2.54:1 and is reserved
              for disabled controls and aria-hidden decoration. */}
          <p id={`${summaryId}-help`} className="text-bcc-text-secondary" style={{ fontSize: "12px" }}>
            {touched && summaryMissing
              ? "A summary is required — it's what readers see in the feed and on your page."
              : `One line readers see before opening. ${trimmedSummary.length}/${ANNOUNCEMENT_SUMMARY_MAX}`}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={bodyId} className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "11px" }}>
            BODY (MARKDOWN)
          </label>
          <textarea
            id={bodyId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            rows={10}
            disabled={pending}
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text disabled:opacity-50"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "11px" }}>
            WHEN
          </legend>
          {(["draft", "publish", "schedule"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-bcc-text">
              <input
                type="radio"
                name="announcement-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={pending}
              />
              <span>
                {value === "draft" && "Save as draft"}
                {value === "publish" && "Publish now"}
                {value === "schedule" && "Schedule for later"}
              </span>
            </label>
          ))}
        </fieldset>

        {mode === "schedule" && (
          <div className="flex flex-col gap-1">
            <label htmlFor={dateId} className="bcc-mono text-bcc-text-secondary" style={{ fontSize: "11px" }}>
              PUBLICATION TIME
            </label>
            <input
              id={dateId}
              type="datetime-local"
              value={publishAtLocal}
              onChange={(e) => setPublishAtLocal(e.target.value)}
              disabled={pending}
              aria-describedby={`${dateId}-help`}
              aria-invalid={touched && scheduleNeedsFutureDate}
              className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
            />
            <p id={`${dateId}-help`} className="text-bcc-text-secondary" style={{ fontSize: "12px" }}>
              {touched && scheduleNeedsFutureDate
                ? "Pick a time in the future — announcements can't be backdated."
                : "Shown in your local time; stored and compared in UTC."}
            </p>
          </div>
        )}

        <label htmlFor={commentsId} className="flex items-center gap-2 text-bcc-text">
          <input
            id={commentsId}
            type="checkbox"
            checked={commentsEnabled}
            onChange={(e) => setCommentsEnabled(e.target.checked)}
            disabled={pending}
          />
          <span>Allow comments</span>
        </label>

        {error !== null && error !== undefined && (
          <p role="alert" className="text-bcc-danger" style={{ fontSize: "13px" }}>
            {failureCopy}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="bcc-mono rounded-sm border border-bcc-border px-4 py-2 text-bcc-text-secondary disabled:opacity-50"
            style={{ minHeight: "44px", fontSize: "12px" }}
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={blocked || pending}
            className="bcc-mono rounded-sm border border-bcc-border bg-bcc-surface-raised px-4 py-2 text-bcc-text disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: "44px", fontSize: "12px" }}
          >
            {pending ? <Spinner size={16} /> : null}
            {mode === "draft" && "SAVE DRAFT"}
            {mode === "publish" && "PUBLISH"}
            {mode === "schedule" && "SCHEDULE"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
