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

  const pending = blockMutation.isPending || unblockMutation.isPending;

  const handleClick = () => {
    // The button stays focusable while a request runs (aria-disabled, not
    // disabled), so a second press is ignored here instead.
    if (pending) return;
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

  // F-264 (UX Lows):
  //  - The name carries the handle ("Block @jo"), so out of context (a
  //    screen reader's button list) it says whom it acts on.
  //  - No aria-pressed. The label already swaps between BLOCK and
  //    UNBLOCK, so a toggle state on top read as "UNBLOCK, pressed",
  //    which says the opposite of the state.
  //  - aria-disabled + aria-busy while a request runs, not `disabled`: the
  //    browser blurs a focused control that turns disabled, and the
  //    viewer just pressed this one.
  //  - 44px tall (F-259's M8: it was about 30px). An important action, not
  //    a dense chip, so the 36px exception does not apply.
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        // Starts with the visible word, so a voice-control "click block"
        // still matches. While working, the visible "WORKING…" is the name.
        aria-label={pending ? undefined : `${blocking ? "Unblock" : "Block"} @${profile.handle}`}
        aria-disabled={pending}
        aria-busy={pending}
        className={
          "bcc-mono inline-flex min-h-[44px] items-center border-2 px-3 py-1.5 text-[11px] tracking-[0.18em] transition aria-disabled:cursor-wait aria-disabled:opacity-60 " +
          (blocking
            ? "border-safety/60 text-bcc-text-safety hover:border-safety hover:bg-safety/10"
            : "border-bcc-border text-bcc-text-secondary hover:border-bcc-border-strong hover:text-bcc-text")
        }
      >
        {pending
          ? "WORKING…"
          : blocking
            ? "UNBLOCK"
            : "BLOCK"}
      </button>
      {errorMessage !== null && (
        <span role="alert" className="bcc-mono text-[10px] text-bcc-text-error">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
