"use client";

/**
 * UnsavedChangesDialog — the two things we say when someone tries to leave a
 * settings section with work in progress.
 *
 * Built on the shared `Dialog`, which already supplies the focus trap, focus
 * return to the trigger, and ESC handling, and is reduced-motion aware. There
 * is no reason for a second dialog implementation here.
 *
 * ## Two modes, and why the difference matters
 *
 * **decision** — the form is dirty and nothing is in flight. Leaving would
 * throw the edits away, and that is entirely the user's call, so both options
 * are offered.
 *
 * **waiting** — a mutation is already on the wire. "Discard" is withheld here
 * on purpose: the request has left the browser and we cannot promise the
 * server will ignore it, so offering to discard would be a lie. The user is
 * told to wait, the destination is remembered, and the provider completes the
 * move once the save settles.
 *
 * ESC and the corner close both mean "keep editing" in either mode — the
 * safest reading of an ambiguous dismissal is that nothing should be lost.
 */

import { Dialog } from "@/components/ui/Dialog";

export interface UnsavedChangesDialogProps {
  mode: "decision" | "waiting";
  /** Human phrases for the dirty surfaces, e.g. ["your email address"]. */
  labels: string[];
  onKeepEditing: () => void;
  onDiscard: () => void;
}

/** "a", "a and b", "a, b and c" — reads as a sentence, not a list dump. */
function joinLabels(labels: string[]): string {
  if (labels.length === 0) return "unsaved changes";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function UnsavedChangesDialog({
  mode,
  labels,
  onKeepEditing,
  onDiscard,
}: UnsavedChangesDialogProps) {
  const waiting = mode === "waiting";

  return (
    <Dialog
      title={waiting ? "Saving your changes…" : "You have unsaved changes"}
      onClose={onKeepEditing}
      panelClassName="max-w-md flex flex-col gap-4"
    >
      <p className="font-serif text-base text-bcc-text">
        {waiting
          ? "Please wait before leaving this section."
          : `You have unsaved changes to ${joinLabels(labels)}. If you leave this section now, they'll be lost.`}
      </p>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onKeepEditing}
          className="bcc-btn bcc-btn-outline bcc-btn-sm"
        >
          {waiting ? "Stay here" : "Keep editing"}
        </button>

        {/* Absent in waiting mode — see the header note. */}
        {!waiting && (
          <button
            type="button"
            onClick={onDiscard}
            className="bcc-btn bcc-btn-sm border-2 border-safety/70 text-safety transition hover:bg-safety/10"
          >
            Discard changes
          </button>
        )}
      </div>
    </Dialog>
  );
}
