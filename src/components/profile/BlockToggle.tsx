"use client";

/**
 * BlockToggle — §K1 Phase A inline button on member profiles.
 *
 * Server-driven state via `viewer_blocking` on the user view-model. A
 * confirmation dialog gates the *block* direction; unblock is one tap,
 * mirrored locally for instant feedback and rolled back on error.
 *
 * Hidden when the viewer can't block (anonymous / self / disabled
 * by tier). The CTA is intentionally lower-key than primary/ghost
 * buttons — block is a tool, not a marketing affordance.
 *
 * F-261 (audit M16): the confirm was a plain `window.confirm` that said
 * only "they won't see your posts on the Floor and you won't see theirs",
 * and nothing confirmed the block afterwards. It is now the house
 * ConfirmDialog, saying what a block does on the server (BLOCK_COPY), and
 * a polite status line says "Blocked @x." / "Unblocked @x." when it lands.
 * Either way the profile page is refreshed (router.refresh()), so its
 * server-rendered parts, such as the Message pill, catch up.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useBlockUser, useUnblockUser } from "@/hooks/useBlocks";
import type { MemberProfile } from "@/lib/api/types";
import { BccApiError } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

/**
 * What a block does, each line matching the server:
 *  - posts: the feeds drop authors blocked in either direction
 *    (FeedRankingService::dropMutuallyBlockedAuthors);
 *  - messages: the send gate refuses a mutual block either way
 *    (MessagesService, PeepSoBlockRepository::isMutuallyBlocked);
 *  - watching: a new block removes follows in BOTH directions, and
 *    unblocking restores none (F-29; MyBlocksEndpoint → severFollowsBetween).
 */
export const BLOCK_COPY = {
  title: (handle: string) => `Block @${handle}?`,
  body:
    "You won't see each other's posts in your feeds, and neither of you can message the other. " +
    "Any watching between you stops, and unblocking won't bring it back.",
  confirm: "Block",
  cancel: "Cancel",
  retry: "Try again",
  blocked: (handle: string) => `Blocked @${handle}.`,
  unblocked: (handle: string) => `Unblocked @${handle}.`,
} as const;

interface BlockToggleProps {
  profile: MemberProfile;
}

function failureCopy(err: unknown, verb: "block" | "unblock"): string {
  return err instanceof BccApiError && err.code === "bcc_rate_limited"
    ? `Slow down — too many ${verb} attempts. Wait a minute.`
    : verb === "block"
      ? "Couldn't block. Try again."
      : "Couldn't unblock. Try again.";
}

export function BlockToggle({ profile }: BlockToggleProps) {
  const router = useRouter();
  const canBlock = isAllowed(profile.permissions, "can_block");
  const [optimisticBlocking, setOptimisticBlocking] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // The polite notice. Its region is mounted empty with the control and
  // each event's text is a fresh <span key={seq}>, so a repeat is read
  // again (#328).
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null);
  const noticeSeq = useRef(0);
  const announce = (text: string) => {
    noticeSeq.current += 1;
    setNotice({ seq: noticeSeq.current, text });
  };

  const blocking = optimisticBlocking ?? profile.viewer_blocking;

  const blockMutation = useBlockUser();
  const unblockMutation = useUnblockUser({
    onError: (err) => {
      setOptimisticBlocking(true);
      setErrorMessage(failureCopy(err, "unblock"));
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
      unblockMutation.mutate(profile.user_id, {
        onSuccess: () => {
          announce(BLOCK_COPY.unblocked(profile.handle));
          router.refresh();
        },
      });
    } else {
      setDialogError(null);
      setConfirming(true);
    }
  };

  const confirmBlock = () => {
    setDialogError(null);
    blockMutation.mutate(profile.user_id, {
      onSuccess: () => {
        setOptimisticBlocking(true);
        setConfirming(false);
        announce(BLOCK_COPY.blocked(profile.handle));
        router.refresh();
      },
      onError: (err) => setDialogError(failureCopy(err, "block")),
    });
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
      <p role="status" className="sr-only">
        {notice !== null && <span key={notice.seq}>{notice.text}</span>}
      </p>
      {confirming && (
        <ConfirmDialog
          title={BLOCK_COPY.title(profile.handle)}
          body={BLOCK_COPY.body}
          confirmLabel={BLOCK_COPY.confirm}
          cancelLabel={BLOCK_COPY.cancel}
          retryLabel={BLOCK_COPY.retry}
          errorMessage={dialogError}
          pending={blockMutation.isPending}
          onConfirm={confirmBlock}
          onCancel={() => {
            setConfirming(false);
            setDialogError(null);
          }}
        />
      )}
    </div>
  );
}
