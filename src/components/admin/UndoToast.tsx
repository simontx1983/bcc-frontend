"use client";

/**
 * UndoToast — §K1 moderation recovery affordance UI surface.
 *
 * Pattern-registry principle (`docs/pattern-registry.md` →
 * "Moderation recovery affordances"):
 *
 *     Undo is a moderation recovery affordance,
 *     NOT a historical correctness mechanism.
 *
 * That single sentence is the rationale for every constraint of this
 * component:
 *
 *   - **Single active toast.** A new mutation REPLACES the previous
 *     toast. There is NO undo stack. Pressure to grow this into a
 *     stack will appear later (e.g. "undo my last three actions");
 *     resist unless the moderation model itself fundamentally
 *     changes. The server's TTL is per-token; multiple tokens in
 *     flight is fine on the wire, but the UI surface is
 *     deliberately single-slot.
 *
 *   - **Lifecycle bound to component mount.** No persistence across
 *     page reloads. Lose the tab, lose the affordance. The forward
 *     action committed; recovery is recovery, not entitlement.
 *
 *   - **Countdown is decoration.** The server's `expires_at` is
 *     authoritative. The local `setInterval` is a UX courtesy. If
 *     the client clock is wrong by a few seconds, the worst case is
 *     a click that lands as `bcc_undo_expired` — exactly the right
 *     posture.
 *
 *   - **Fail closed on the click.** Every failure code from the
 *     server (`bcc_undo_expired` / `bcc_undo_forbidden` /
 *     `bcc_undo_stale_state`) renders as a short error message and
 *     dismisses the toast. No automatic retry. No queued retry.
 *
 *   - **Reduced-motion respected.** The progress-bar transition is
 *     gated on `motion-safe:` variants. Reduced-motion users see a
 *     static numeric countdown only.
 *
 *   - **ARIA `role="status"` + `aria-live="polite"`.** The toast
 *     announces "Hidden post — Undo within N seconds" to assistive
 *     tech without stealing focus. The Undo button is reachable via
 *     normal tab order.
 */

import { useEffect, useRef, useState } from "react";

import { useUndoAdminReport } from "@/hooks/useAdminReports";
import type { ModerationAction, ModerationUndoDescriptor } from "@/lib/api/types";

/**
 * Stable per-mutation descriptor the queue lifts up so this toast
 * can render. The parent generates a fresh `instanceKey` each time
 * (e.g. the report id + timestamp) so the toast re-mounts and the
 * countdown resets cleanly when a new action replaces an in-flight
 * one.
 */
export interface UndoToastDescriptor {
  /** Unique-per-mutation key — used as React key to force remount. */
  instanceKey: string;
  /** Original moderation action that issued the token. */
  action: ModerationAction;
  /** Report id, for the toast body copy and post-undo accessibility. */
  reportId: number;
  /** Server-issued descriptor — see ModerationUndoDescriptor. */
  undo: ModerationUndoDescriptor;
}

interface Props {
  descriptor: UndoToastDescriptor;
  /**
   * Called when the toast should disappear — either:
   *   - user clicked Undo (after the mutation settles, success OR error)
   *   - countdown elapsed
   *   - user clicked the close X
   * The queue clears its `lastUndoable` state on this callback.
   */
  onDismiss: () => void;
}

const ACTION_LABELS: Record<ModerationAction, string> = {
  hide:    "Hidden post",
  dismiss: "Dismissed report",
  restore: "Restored post",
};

export function UndoToast({ descriptor, onDismiss }: Props) {
  const { undo, action, reportId } = descriptor;

  // The mutation is owned by THIS toast instance so that the toast's
  // unmount cleans up the in-flight click cleanly.
  const undoMutation = useUndoAdminReport({
    onSuccess: () => onDismiss(),
    onError:   () => {
      // Surface the error in the toast body for 2s then dismiss.
      // No retry, no requeue — see the file-level docblock.
      window.setTimeout(onDismiss, 2000);
    },
  });

  // Local countdown driven by setInterval; the server's expires_at
  // is the authority. We re-derive secondsLeft each tick from the
  // server timestamp rather than decrementing a local counter — that
  // way clock drift / tab-throttling doesn't compound.
  const expiresAtMs = useRef<number>(new Date(undo.expires_at).getTime());
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.ceil((expiresAtMs.current - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      onDismiss();
      return;
    }
    const id = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((expiresAtMs.current - Date.now()) / 1000));
      setSecondsLeft(next);
      if (next <= 0) {
        // The interval callback dismisses; the useEffect on `secondsLeft`
        // would also dismiss on the next render, but doing it here means
        // we don't render a 0-second flash.
        window.clearInterval(id);
        onDismiss();
      }
    }, 250);
    return () => window.clearInterval(id);
    // descriptor.instanceKey changes => component remounts (different key
    // at the call site), so this effect only ever runs for one toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUndoClick = () => {
    if (undoMutation.isPending) return;
    undoMutation.mutate(undo.token);
  };

  const errorMessage = undoMutation.error?.message ?? null;
  const errorCode    = undoMutation.error?.code ?? null;

  const progressPercent = Math.max(0, Math.min(100, (secondsLeft / undo.ttl_seconds) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${ACTION_LABELS[action]} — undo within ${secondsLeft} seconds`}
      className="bcc-panel pointer-events-auto fixed bottom-6 left-1/2 z-40 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 p-4 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-safety">
            {ACTION_LABELS[action].toUpperCase()} · REPORT #{reportId}
          </span>
          {errorMessage === null ? (
            <span className="font-serif text-sm text-ink-soft">
              {undoMutation.isPending
                ? "Reversing…"
                : `Undo within ${secondsLeft}s`}
            </span>
          ) : (
            <span className="bcc-mono text-[11px] text-safety">
              {undoFailureCopy(errorCode, errorMessage)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {errorMessage === null && (
            <button
              type="button"
              onClick={handleUndoClick}
              disabled={undoMutation.isPending || secondsLeft <= 0}
              title="Undo (H/D/R action — 30s window)"
              className="bcc-mono inline-flex min-h-[36px] items-center border-2 border-ink bg-ink px-3 py-1.5 text-[11px] tracking-[0.18em] text-cardstock transition hover:bg-blueprint disabled:opacity-50"
            >
              UNDO
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss undo affordance"
            className="bcc-mono inline-flex min-h-[36px] min-w-[36px] items-center justify-center text-[14px] text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress bar — decorative, motion-safe transitioned. Reduced
          motion users still see the numeric countdown above; the bar
          just stops easing. */}
      {errorMessage === null && (
        <div
          aria-hidden
          className="h-[2px] w-full overflow-hidden bg-cardstock-edge/30"
        >
          <div
            className="h-full bg-safety motion-safe:transition-[width] motion-safe:duration-[250ms] motion-safe:ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Map the server's undo error codes to short, admin-readable copy.
 * Every branch is a fail-closed state — no retry path renders here.
 */
function undoFailureCopy(code: string | null, fallback: string): string {
  switch (code) {
    case "bcc_undo_expired":
      return "Undo window expired.";
    case "bcc_undo_forbidden":
      return "This token belongs to another admin.";
    case "bcc_undo_stale_state":
      return "Another moderator already acted on this report.";
    default:
      return `Undo failed: ${fallback}`;
  }
}
