"use client";

/**
 * SettingsSaveStatus — one answer to "did that save?" across the settings
 * panels.
 *
 * Seven files previously hand-rolled a `savedAt` timestamp plus a fade, and
 * they disagreed on wording: three rendered `SAVED` / `SAVING…`, six rendered
 * `Saved` / `Saving…`. This is the single implementation.
 *
 * ## Announcement model
 *
 * `Saving…` and `Saved` go through one polite live region. `Couldn't save`
 * uses the application's existing `role="alert"` pattern instead, and the
 * polite region renders nothing in that state — so a failure is announced
 * once, not twice by two competing regions.
 *
 * The visible string and the announced string are the same text. The region's
 * content is keyed on the status, so re-rendering an unchanged status does not
 * re-announce it.
 *
 * ## Timing
 *
 * `Saved` clears itself after a few seconds; `Couldn't save` does not. A
 * failure has to stay on screen long enough to be read and acted on, and it
 * is replaced only by the next save attempt.
 *
 * There is deliberately no debounce or announce-delay knob. This PR migrates
 * only explicit-save forms, where each status change follows a button press —
 * one press, one announcement. Autosave surfaces have different timing and
 * will get their own design before they adopt this component.
 *
 * ## Layout
 *
 * The slot reserves height and width for the longest string, so moving
 * through idle → saving → saved never nudges the surrounding controls.
 *
 * Not for actions whose success navigates away or removes the account
 * (delete account, sign out everywhere) — "Saved" is the wrong word for those
 * and they keep their own feedback.
 */

import { useEffect, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long a success stays on screen. Failures never auto-clear. */
const SAVED_VISIBLE_MS = 3000;

export interface SettingsSaveStatusProps {
  status: SaveStatus;
  /** Shown after the generic failure line when the server explained itself. */
  errorMessage?: string | undefined;
  className?: string | undefined;
}

export function SettingsSaveStatus({
  status,
  errorMessage,
  className,
}: SettingsSaveStatusProps) {
  // Success fades; everything else is driven straight from the prop.
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    if (status !== "saved") {
      setSavedVisible(false);
      return;
    }
    setSavedVisible(true);
    const timer = window.setTimeout(() => setSavedVisible(false), SAVED_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const effective: SaveStatus =
    status === "saved" && !savedVisible ? "idle" : status;

  return (
    <span
      className={`bcc-mono inline-flex min-h-[18px] min-w-[104px] items-center text-[10px] tracking-[0.16em] ${className ?? ""}`}
    >
      {/* Polite region for progress + success only. Rendering nothing during
          an error keeps this from double-announcing alongside the alert. */}
      <span role="status" aria-live="polite" className="sr-only">
        {effective === "saving" ? "Saving…" : effective === "saved" ? "Saved" : ""}
      </span>

      {effective === "saving" && (
        <span aria-hidden className="text-bcc-text-secondary">
          Saving…
        </span>
      )}

      {effective === "saved" && (
        <span aria-hidden className="text-bcc-success">
          Saved
        </span>
      )}

      {effective === "error" && (
        <span role="alert" className="text-safety">
          Couldn&apos;t save
          {errorMessage !== undefined && errorMessage !== "" ? ` — ${errorMessage}` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * Map a React Query mutation onto the four statuses.
 *
 * Kept as a plain function rather than a hook so a caller with two mutations
 * (a field row saving a value and a visibility at once) can combine them
 * without breaking hook ordering.
 */
export function saveStatusFrom(m: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}): SaveStatus {
  if (m.isPending) return "saving";
  if (m.isError) return "error";
  if (m.isSuccess) return "saved";
  return "idle";
}
