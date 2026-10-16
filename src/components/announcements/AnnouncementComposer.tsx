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
  /**
   * Whether a saved draft can be found again.
   *
   * Offering "Save as draft" with nothing able to list drafts put the
   * operator's work out of their own reach — the server stored it, and
   * the product had no route back to it. The mode is therefore gated on
   * the surface that retrieves it existing, rather than on the server
   * accepting the write, which it always did.
   *
   * Defaults to false: a caller that has not said it can reopen drafts
   * is assumed not to be able to.
   */
  canReopenDrafts?: boolean;
}

/**
 * `datetime-local` yields wall-clock text with no zone. Interpreting it
 * in the viewer's own zone and sending UTC is the only reading that
 * matches what the operator saw in the field.
 *
 * ⚠ The wire format is `Y-m-d H:i:s` — a space, no `T`, no `Z`, no
 * fractional seconds. This sent `toISOString()`, which the route refuses
 * outright, so the composer's Schedule mode could never succeed. Measured
 * against the real backend:
 *
 *     publish_at: "2026-10-17T19:58:51.114956Z"  → 400 bcc_invalid_request
 *       "publish_at must be a strictly future UTC instant formatted Y-m-d H:i:s."
 *     publish_at: "2026-10-17 19:58:51"          → 200, state "future"
 *
 * The instant is unchanged — only the rendering. `toISOString()` is still
 * what converts the viewer's local wall-clock to UTC; the slice and swap
 * are what the route accepts.
 */
function toUtcWireInstant(instant: Date): string {
  // "2026-10-17T19:58:51.114Z" → "2026-10-17 19:58:51"
  return instant.toISOString().slice(0, 19).replace("T", " ");
}

export function AnnouncementComposer({
  onClose,
  onSubmit,
  pending,
  error,
  canReopenDrafts = false,
}: AnnouncementComposerProps) {
  const titleId = useId();
  const summaryId = useId();
  const bodyId = useId();
  const dateId = useId();
  const commentsId = useId();
  const draftUnavailableId = useId();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<AnnouncementPublishMode>("publish");
  const [publishAtLocal, setPublishAtLocal] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [touched, setTouched] = useState(false);
  // Set when a submit is refused because the chosen instant went past
  // while the form was open. See handleSubmit.
  const [staleSchedule, setStaleSchedule] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedSummary = summary.trim();
  const trimmedBody = body.trim();
  // Parsed ONCE. The future-check used to re-parse the formatter's own
  // output, which is a trap now that the wire format is space-separated:
  // `Date.parse("2026-10-17 19:58:51")` is read as LOCAL time by V8, so
  // the check would drift by the viewer's UTC offset and let a past
  // instant through west of Greenwich. Holding the Date avoids the
  // round-trip entirely.
  const publishAtDate = publishAtLocal === "" ? null : new Date(publishAtLocal);
  const publishAtValid =
    publishAtDate !== null && !Number.isNaN(publishAtDate.getTime());
  const publishAtWire = publishAtValid ? toUtcWireInstant(publishAtDate) : null;

  // Summary is validated on its own so a missing summary can never be
  // masked by a title or body problem — it is a first-class field.
  const summaryMissing = trimmedSummary === "";
  const scheduleNeedsFutureDate =
    mode === "schedule" &&
    (!publishAtValid || publishAtDate.getTime() <= Date.now());

  const blocked =
    trimmedTitle === "" ||
    summaryMissing ||
    trimmedBody === "" ||
    trimmedTitle.length > ANNOUNCEMENT_TITLE_MAX ||
    trimmedSummary.length > ANNOUNCEMENT_SUMMARY_MAX ||
    trimmedBody.length > ANNOUNCEMENT_BODY_MAX ||
    scheduleNeedsFutureDate ||
    // The radio is disabled, which is presentation. This is the gate: a
    // stale render or a devtools click must not be able to save a draft
    // that nothing can retrieve.
    (mode === "draft" && !canReopenDrafts);

  // The time is the problem either because it was already past when the
  // form rendered, or because it went past while the operator was typing.
  const showFutureDateError = touched && (scheduleNeedsFutureDate || staleSchedule);

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

    /**
     * Re-check the instant AT SUBMIT, not only at render.
     *
     * `blocked` is computed during render and compares against
     * `Date.now()` at that moment. React does not re-render on a timer,
     * so an operator who picks a time a minute out and then spends two
     * minutes writing the body submits against a STALE pass: the guard
     * said future when it was rendered, and the instant is past by the
     * time it is sent.
     *
     * The server refuses it correctly — and cannot say why. Its
     * `publish_at_not_future` and `backdating_not_allowed` reason codes
     * are declared in the contract but have no producer, so the refusal
     * arrives as a bare `bcc_invalid_request` and the composer can only
     * fall back to naming every field. Catching it here is what lets the
     * operator be told it was the TIME.
     */
    if (mode === "schedule" && (!publishAtValid || publishAtDate.getTime() <= Date.now())) {
      setStaleSchedule(true);
      return;
    }
    setStaleSchedule(false);

    const request: CreateAnnouncementRequest = {
      title: trimmedTitle,
      summary: trimmedSummary,
      body: trimmedBody,
      mode,
      comments_enabled: commentsEnabled,
    };
    if (mode === "schedule" && publishAtWire !== null) {
      request.publish_at = publishAtWire;
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
          {(["draft", "publish", "schedule"] as const).map((value) => {
            const unavailable = value === "draft" && !canReopenDrafts;
            return (
              <label
                key={value}
                className={
                  "flex items-center gap-2 " +
                  (unavailable ? "text-bcc-text-secondary" : "text-bcc-text")
                }
              >
                <input
                  type="radio"
                  name="announcement-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  disabled={pending || unavailable}
                  aria-describedby={unavailable ? draftUnavailableId : undefined}
                />
                <span>
                  {value === "draft" && "Save as draft"}
                  {value === "publish" && "Publish now"}
                  {value === "schedule" && "Schedule for later"}
                </span>
              </label>
            );
          })}
          {!canReopenDrafts && (
            /*
              The server stores a draft perfectly well — the row is created,
              and `GET /me/validators/:pageId/announcements?status=draft`
              returns it. What was missing was any surface that asks for it,
              so a saved draft had no route back and the composer simply
              closed, giving the operator no way to tell a save from a
              silent failure.
              Nothing typed is discarded by this: title, summary and body
              are independent of the mode, so switching to Publish or
              Schedule keeps every word.
            */
            <p
              id={draftUnavailableId}
              className="text-bcc-text-secondary"
              style={{ fontSize: "12px" }}
              data-testid="announcement-draft-unavailable"
            >
              Drafts can’t be reopened yet, so saving one would put this out of
              your reach. Publish now or schedule it instead — what you’ve
              written is kept either way.
            </p>
          )}
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
              onChange={(e) => { setPublishAtLocal(e.target.value); setStaleSchedule(false); }}
              disabled={pending}
              aria-describedby={`${dateId}-help`}
              aria-invalid={showFutureDateError}
              className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 text-bcc-text disabled:opacity-50"
            />
            <p id={`${dateId}-help`} className="text-bcc-text-secondary" style={{ fontSize: "12px" }}>
              {showFutureDateError
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
