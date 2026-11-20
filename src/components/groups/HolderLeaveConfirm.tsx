"use client";

/**
 * HolderLeaveConfirm / ValidatorLeaveConfirm — the LEAVE control for an
 * on-chain-gated group (NFT holder or delegator), gated behind a
 * `ConfirmDialog`.
 *
 * Leaving either kind records the same 90-day opt-out (one shared,
 * group-id-keyed store on the server) before the group is suggested
 * (auto-joined) again, so the click alone must not fire the request. An
 * explicit rejoin is allowed straight away (F-158); only a moderator
 * removal blocks it.
 *
 * Holder groups are left from three surfaces (the group-detail strip,
 * /settings/communities and the profile Groups tab), delegator groups
 * from two (the strip and the profile tab). Each used to bind its leave
 * mutation to a bare `GroupActionButton`, and the delegator leave still
 * fired on one tap (F-244 item 1). This file is the one binding per kind,
 * over one shared control, so the confirm copy and the open/close wiring
 * cannot drift between surfaces or kinds.
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
import { useLeaveValidatorGroupMutation } from "@/hooks/useValidatorGroups";
import type { BccApiError } from "@/lib/api/types";

interface LeaveConfirmCopy {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

export const HOLDER_LEAVE_CONFIRM_COPY = {
  title: "Leave this community?",
  body: "You'll stop seeing its posts. Leaving starts a 90-day cooldown before this community is suggested to you again, but you can rejoin any time while you hold the NFT.",
  confirmLabel: "LEAVE",
  cancelLabel: "STAY",
} as const satisfies LeaveConfirmCopy;

export const VALIDATOR_LEAVE_CONFIRM_COPY = {
  title: "Leave this community?",
  body: "You'll stop seeing its posts. Leaving starts a 90-day cooldown before this community is suggested to you again, but you can rejoin any time while you delegate to this validator.",
  confirmLabel: "LEAVE",
  cancelLabel: "STAY",
} as const satisfies LeaveConfirmCopy;

export interface HolderLeaveConfirmProps {
  groupId: number;
  /** §γ — code-keyed copy for a failed leave. Never `err.message`. */
  humanizeError: (err: BccApiError) => string;
  /** Fires the instant the user confirms, before the request resolves. */
  onLeaveStart?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
  /** GroupActionButton's drawn 44px box, so LEAVE matches JOIN on the
   *  group page strip. Off: the dense-row size, with a 44px hit area. */
  touchTarget?: boolean;
}

/** Same props for both kinds. */
export type ValidatorLeaveConfirmProps = HolderLeaveConfirmProps;

interface LeaveMutation {
  isPending: boolean;
  error: BccApiError | null;
  mutate: (groupId: number) => void;
  reset: () => void;
}

/** The shared control: the LEAVE button plus its confirmation. */
function LeaveConfirmControl({
  groupId,
  copy,
  mutation,
  confirming,
  setConfirming,
  humanizeError,
  onLeaveStart,
  touchTarget,
}: {
  groupId: number;
  copy: LeaveConfirmCopy;
  mutation: LeaveMutation;
  confirming: boolean;
  setConfirming: (open: boolean) => void;
  humanizeError: (err: BccApiError) => string;
  onLeaveStart?: (() => void) | undefined;
  touchTarget: boolean;
}) {
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
        touchTarget={touchTarget}
        onClick={() => {
          mutation.reset();
          setConfirming(true);
        }}
      />
      {confirming && (
        <ConfirmDialog
          title={copy.title}
          body={copy.body}
          confirmLabel={copy.confirmLabel}
          cancelLabel={copy.cancelLabel}
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

export function HolderLeaveConfirm({
  groupId,
  humanizeError,
  onLeaveStart,
  onSuccess,
  onError,
  touchTarget = false,
}: HolderLeaveConfirmProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useLeaveHolderGroupMutation({
    onSuccess: () => {
      setConfirming(false);
      onSuccess?.();
    },
    onError: () => onError?.(),
  });
  return (
    <LeaveConfirmControl
      groupId={groupId}
      copy={HOLDER_LEAVE_CONFIRM_COPY}
      mutation={mutation}
      confirming={confirming}
      setConfirming={setConfirming}
      humanizeError={humanizeError}
      onLeaveStart={onLeaveStart}
      touchTarget={touchTarget}
    />
  );
}

export function ValidatorLeaveConfirm({
  groupId,
  humanizeError,
  onLeaveStart,
  onSuccess,
  onError,
  touchTarget = false,
}: ValidatorLeaveConfirmProps) {
  const [confirming, setConfirming] = useState(false);
  const mutation = useLeaveValidatorGroupMutation({
    onSuccess: () => {
      setConfirming(false);
      onSuccess?.();
    },
    onError: () => onError?.(),
  });
  return (
    <LeaveConfirmControl
      groupId={groupId}
      copy={VALIDATOR_LEAVE_CONFIRM_COPY}
      mutation={mutation}
      confirming={confirming}
      setConfirming={setConfirming}
      humanizeError={humanizeError}
      onLeaveStart={onLeaveStart}
      touchTarget={touchTarget}
    />
  );
}
