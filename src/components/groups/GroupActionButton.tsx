"use client";

/**
 * GroupActionButton — presentational button for group join/leave (and
 * other per-group actions) with built-in pending state, inline error
 * surfacing, and a11y wiring.
 *
 * Hook-agnostic: the consumer owns the mutation and passes `isPending`
 * / `errorMessage` / `onClick`. This is the §4.7.x cross-kind primitive
 * — used by holder groups (`useJoinHolderGroupMutation`) in
 * `components/settings/CommunitiesList.tsx` and by plain groups
 * (`useJoinPlainGroupMutation`) on the discovery page.
 *
 * `errorMessage` is rendered verbatim — it carries the server's
 * `BccApiError.message`, which is the user-facing unlock_hint copy
 * (per §A2 / §4.7.x). Never substitute a generic error string.
 */
export interface GroupActionButtonProps {
  /** Used for the error-region id (`bcc-action-error-${groupId}`). */
  groupId: number;
  /** Idle-state label (e.g. "JOIN" / "LEAVE"). */
  label: string;
  /** Pending-state label (e.g. "JOINING…"). */
  pendingLabel: string;
  isPending: boolean;
  /** Server `error.message` to surface inline; `null` when no error. */
  errorMessage: string | null;
  onClick: () => void;
}

export function GroupActionButton({
  groupId,
  label,
  pendingLabel,
  isPending,
  errorMessage,
  onClick,
}: GroupActionButtonProps) {
  const errorId = `bcc-action-error-${groupId}`;
  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-describedby={errorMessage !== null ? errorId : undefined}
        className="bcc-mono inline-flex items-center border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink-soft transition motion-reduce:transition-none hover:border-ink/50 hover:text-ink disabled:opacity-60"
      >
        {isPending ? pendingLabel : label}
      </button>
      {errorMessage !== null && (
        <p
          id={errorId}
          role="alert"
          className="bcc-mono max-w-[14rem] text-right text-[10px] tracking-[0.12em] text-safety"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
