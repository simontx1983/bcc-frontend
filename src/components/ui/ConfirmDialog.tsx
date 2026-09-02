"use client";

/**
 * ConfirmDialog — one confirmation body for destructive, non-undoable
 * actions.
 *
 * Before this existed, every confirmation in the app composed `Dialog`
 * and hand-rolled its own body, buttons and pending handling
 * (`SignOutModal`, `GroupTransferOwnership`, `UnsavedChangesDialog`).
 * Adding two more image-removal confirmations that way would have made
 * five parallel implementations of the same three lines, so this is the
 * shared one. `UnsavedChangesDialog` deliberately stays separate — it is
 * a two-mode navigation guard, not a destructive confirm.
 *
 * `Dialog` already supplies the portal, focus trap, focus return, scroll
 * lock, Escape handling and reduced-motion awareness. Nothing here
 * duplicates any of that.
 *
 * ## Why the dialog stays open on failure
 *
 * A removal that fails has changed nothing — the image is still there
 * and the useful next action is to try again. Closing would strand the
 * user with an error somewhere else on the page and no obvious retry.
 * So a failure re-labels the confirm button and renders the reason
 * in-place. Callers whose failures require editing a field instead
 * (a taken handle, a validation error) should close and surface the
 * error at that field — this component is not for those.
 *
 * ## Double-submit
 *
 * Guarded three ways, because a disabled attribute alone loses a race
 * with a fast double-click: the button is `disabled` while pending, the
 * handler returns early while pending, and `closeDisabled` blocks the
 * dismissal paths so the dialog cannot be torn down mid-flight.
 */

import { useEffect, useRef } from "react";

import { Dialog } from "@/components/ui/Dialog";

export interface ConfirmDialogProps {
  title: string;
  /** Plain sentence explaining what happens. No markup. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Shown in place of `confirmLabel` once a previous attempt failed. */
  retryLabel?: string;
  /** Human, code-mapped copy. Never a raw server message. */
  errorMessage?: string | null | undefined;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  retryLabel,
  errorMessage,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const failed = errorMessage !== null && errorMessage !== undefined && errorMessage !== "";

  /**
   * One-shot latch.
   *
   * `pending` alone is not enough and this was a real hole: it comes from
   * the caller's mutation, and React Query does not flip `isPending`
   * until the next render. Two clicks inside one frame therefore both saw
   * `pending === false` and both fired — measured, `mutate` was called
   * twice for one confirmed removal. The `disabled` attribute has the
   * same lag.
   *
   * The latch releases when a failure arrives, which is exactly when a
   * retry becomes legitimate.
   */
  const firedRef = useRef(false);
  useEffect(() => {
    if (failed) firedRef.current = false;
  }, [failed]);

  function handleConfirm() {
    if (pending || firedRef.current) return;
    firedRef.current = true;
    onConfirm();
  }

  function handleCancel() {
    // Escape and the backdrop both route here. Refusing while in flight
    // matches `closeDisabled` below — we cannot recall a sent request, so
    // tearing the dialog down would leave the outcome unreported.
    if (pending) return;
    onCancel();
  }

  return (
    <Dialog
      title={title}
      onClose={handleCancel}
      closeDisabled={pending}
      panelClassName="max-w-md flex flex-col gap-4"
    >
      <p className="font-serif text-base text-bcc-text">{body}</p>

      {failed && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="bcc-btn bcc-btn-outline bcc-btn-sm disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="bcc-btn bcc-btn-sm border-2 border-safety/70 text-safety transition hover:bg-safety/10 disabled:cursor-wait disabled:opacity-50"
        >
          {pending ? "Working…" : failed ? (retryLabel ?? confirmLabel) : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
