"use client";

/**
 * HolderLeaveConfirm — the LEAVE control for an NFT holder group, gated
 * behind a `ConfirmDialog`.
 *
 * Leaving a holder group starts a 90-day cooldown before the group is
 * suggested again, so the click alone must not fire the request. Three
 * surfaces leave holder groups (the group-detail strip, /settings/
 * communities and the profile Groups tab); each used to bind
 * `useLeaveHolderGroupMutation` to a bare `GroupActionButton`. This is
 * the one shared binding so the confirm copy and the open/close wiring
 * cannot drift between them.
 *
 * Callers keep what genuinely differs per surface: the code-keyed error
 * copy, what happens on success (router refresh vs. query invalidation)
 * and the strip's optimistic pill intent.
 *
 * A failure keeps the dialog open with the reason in it (ConfirmDialog's
 * contract); the error is cleared on cancel and on every new attempt.
 * Hall and plain-group leaves have no cooldown and do not use this.
 */

import { useState } from "react";

import { GroupActionButton } from "@/components/groups/GroupActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useLeaveHolderGroupMutation } from "@/hooks/useHolderGroups";
import type { BccApiError } from "@/lib/api/types";

export const HOLDER_LEAVE_CONFIRM_COPY = {
  title: "Leave this community?",
  body: "You'll stop seeing its posts. Leaving starts a 90-day cooldown before this community is suggested to you again.",
  confirmLabel: "LEAVE",
  cancelLabel: "STAY",
} as const;

export interface HolderLeaveConfirmProps {
  groupId: number;
  /** §γ — code-keyed copy for a failed leave. Never `err.message`. */
  humanizeError: (err: BccApiError) => string;
  /** Fires the instant the user confirms, before the request resolves. */
  onLeaveStart?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
}

export function HolderLeaveConfirm({
  groupId,
  humanizeError,
  onLeaveStart,
  onSuccess,
  onError,
}: HolderLeaveConfirmProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useLeaveHolderGroupMutation({
    onSuccess: () => {
      setConfirming(false);
      onSuccess?.();
    },
    onError: () => onError?.(),
  });

  const errorMessage = mutation.error ? humanizeError(mutation.error) : null;

  return (
    <>
      <GroupActionButton
        groupId={groupId}
        label="LEAVE"
        pendingLabel="LEAVING…"
        isPending={mutation.isPending}
        // Failures render inside the dialog, which is open whenever one exists.
        errorMessage={null}
        onClick={() => {
          mutation.reset();
          setConfirming(true);
        }}
      />
      {confirming && (
        <ConfirmDialog
          title={HOLDER_LEAVE_CONFIRM_COPY.title}
          body={HOLDER_LEAVE_CONFIRM_COPY.body}
          confirmLabel={HOLDER_LEAVE_CONFIRM_COPY.confirmLabel}
          cancelLabel={HOLDER_LEAVE_CONFIRM_COPY.cancelLabel}
          retryLabel="TRY AGAIN"
          errorMessage={errorMessage}
          pending={mutation.isPending}
          onConfirm={() => {
            mutation.reset();
            onLeaveStart?.();
            mutation.mutate(groupId);
          }}
          onCancel={() => {
            mutation.reset();
            setConfirming(false);
          }}
        />
      )}
    </>
  );
}
