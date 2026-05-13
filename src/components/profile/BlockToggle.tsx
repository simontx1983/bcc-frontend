"use client";

/**
 * BlockToggle — §K1 Phase A inline button on member profiles.
 *
 * Server-driven state via `viewer_blocking` on the user view-model;
 * we mirror it locally for instant feedback during the round trip
 * and roll back on error. A confirmation dialog gates the *block*
 * direction (irreversible-feeling action); unblock is one tap.
 *
 * Hidden when the viewer can't block (anonymous / self / disabled
 * by tier). The CTA is intentionally lower-key than primary/ghost
 * buttons — block is a tool, not a marketing affordance.
 */

import { useState } from "react";

import { useBlockUser, useUnblockUser } from "@/hooks/useBlocks";
import type { MemberProfile } from "@/lib/api/types";
import { BccApiError } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

interface BlockToggleProps {
  profile: MemberProfile;
}

export function BlockToggle({ profile }: BlockToggleProps) {
  const canBlock = isAllowed(profile.permissions, "can_block");
  const [optimisticBlocking, setOptimisticBlocking] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const blocking = optimisticBlocking ?? profile.viewer_blocking;

  const blockMutation = useBlockUser({
    onError: (err) => {
      setOptimisticBlocking(false);
      setErrorMessage(
        err instanceof BccApiError && err.code === "bcc_rate_limited"
          ? "Slow down — too many block attempts. Wait a minute."
          : "Couldn't block. Try again.",
      );
    },
  });

  const unblockMutation = useUnblockUser({
    onError: (err) => {
      setOptimisticBlocking(true);
      setErrorMessage(
        err instanceof BccApiError && err.code === "bcc_rate_limited"
          ? "Slow down — too many unblock attempts. Wait a minute."
          : "Couldn't unblock. Try again.",
      );
    },
  });

  if (!canBlock) {
    return null;
  }

  const handleClick = () => {
    setErrorMessage(null);
    if (blocking) {
      setOptimisticBlocking(false);
      unblockMutation.mutate(profile.user_id);
    } else {
      const confirmed = window.confirm(
        `Block @${profile.handle}? They won't see your posts on the Floor and you won't see theirs.`,
      );
      if (!confirmed) return;
      setOptimisticBlocking(true);
      blockMutation.mutate(profile.user_id);
    }
  };

  const pending = blockMutation.isPending || unblockMutation.isPending;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          "bcc-mono inline-flex items-center border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition disabled:opacity-60 " +
          (blocking
            ? "border-safety/60 text-safety hover:border-safety hover:bg-safety/10"
            : "border-cardstock-edge text-ink-soft hover:border-ink/50 hover:text-ink")
        }
        aria-pressed={blocking}
      >
        {pending
          ? "WORKING…"
          : blocking
            ? "UNBLOCK"
            : "BLOCK"}
      </button>
      {errorMessage !== null && (
        <span role="alert" className="bcc-mono text-[10px] text-safety">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
