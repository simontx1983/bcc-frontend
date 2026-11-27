"use client";

/**
 * TeamSelfSection — the viewer's own membership: "Show me publicly on
 * this team" (only when `can.set_visibility`) and "Leave this team"
 * (only when `can.leave`; the owner never gets it).
 *
 * The switch shows the SERVER's value, never the one asked for: it
 * reads `viewer.show_publicly` (off when null), the PATCH's answer goes
 * into the team read, and nothing flips while the request is out. A
 * refused change leaves it where the server has it.
 *
 * Leaving asks first, in the shared ConfirmDialog.
 */

import { useId, useState } from "react";

import { ADMIN_FIELD_ERROR_CLASS, ADMIN_OUTLINE_BUTTON_CLASS } from "@/components/admin/validators/form-classes";
import { teamWriteErrorCopy } from "@/components/validator-team/team-copy";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLeaveValidatorTeam, useSetValidatorTeamVisibility } from "@/hooks/useValidatorTeam";
import type { ValidatorTeamResponse } from "@/lib/api/types";

export const SELF_COPY = {
  heading: "YOUR MEMBERSHIP",
  visibilityLabel: "Show me publicly on this team",
  visibilityHint: "When this is on, the page's public team list includes you. It's off unless you turn it on.",
  leave: "Leave this team",
  leaveBody: "You'll lose your team access to this validator page. Only a new invite brings you back.",
} as const;

export interface TeamSelfSectionProps {
  pageId: number;
  data: ValidatorTeamResponse;
  onLeft: () => void;
}

export function TeamSelfSection({ pageId, data, onLeft }: TeamSelfSectionProps) {
  const headingId = useId();
  const canSetVisibility = data.can.set_visibility === true;
  const canLeave = data.can.leave === true;
  if (!canSetVisibility && !canLeave) return null;

  return (
    <section aria-labelledby={headingId} className="bcc-panel flex flex-col gap-5 p-5 sm:p-6">
      <h2 id={headingId} className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
        {SELF_COPY.heading}
      </h2>
      {canSetVisibility && (
        <VisibilitySwitch pageId={pageId} value={data.viewer.show_publicly === true} />
      )}
      {canLeave && <LeaveTeam pageId={pageId} onLeft={onLeft} />}
    </section>
  );
}

function VisibilitySwitch({ pageId, value }: { pageId: number; value: boolean }) {
  const mutation = useSetValidatorTeamVisibility(pageId);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const errorId = useId();
  const pending = mutation.isPending;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-busy={pending}
        aria-disabled={pending}
        aria-describedby={error !== null ? `${hintId} ${errorId}` : hintId}
        onClick={() => {
          if (pending) return;
          setError(null);
          mutation.mutate(
            { show_publicly: !value },
            { onError: (err) => setError(teamWriteErrorCopy(err)) },
          );
        }}
        className="flex min-h-[44px] w-fit items-center gap-3 text-left aria-disabled:cursor-wait"
      >
        <span
          aria-hidden
          className={
            "relative inline-flex h-7 w-12 flex-shrink-0 items-center border-2 transition motion-reduce:transition-none " +
            (value ? "border-bcc-accent-dark bg-bcc-accent-dark" : "border-bcc-border bg-bcc-surface-hover")
          }
        >
          <span
            className={
              "block h-4 w-4 transition-transform motion-reduce:transition-none " +
              (value ? "translate-x-6 bg-bcc-text-inverse" : "translate-x-1 bg-bcc-text")
            }
          />
        </span>
        <span className="font-serif text-bcc-text">{SELF_COPY.visibilityLabel}</span>
      </button>
      <p id={hintId} className="font-serif text-sm text-bcc-text-secondary">
        {pending ? "Saving…" : SELF_COPY.visibilityHint}
      </p>
      {error !== null && (
        <p id={errorId} role="alert" className={ADMIN_FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  );
}

function LeaveTeam({ pageId, onLeft }: { pageId: number; onLeft: () => void }) {
  const leave = useLeaveValidatorTeam(pageId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className={ADMIN_OUTLINE_BUTTON_CLASS + " w-fit"}
      >
        {SELF_COPY.leave}
      </button>
      {confirming && (
        <ConfirmDialog
          title={SELF_COPY.leave}
          body={SELF_COPY.leaveBody}
          confirmLabel="Leave"
          cancelLabel="Stay"
          errorMessage={error}
          pending={leave.isPending}
          onConfirm={() => {
            setError(null);
            leave.mutate(undefined, {
              onSuccess: () => {
                setConfirming(false);
                onLeft();
              },
              onError: (err) => setError(teamWriteErrorCopy(err)),
            });
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
