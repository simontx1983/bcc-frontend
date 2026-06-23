"use client";

/**
 * MemberReviewControl — "Review this member" CTA on a member profile
 * (`/u/[handle]`). Slice 2 of "people as first-class trust subjects":
 * a member is directly reviewable, so this opens the same modal
 * Composer used for entity reviews, targeted at the member's self-page.
 *
 * Sibling to <ReviewCallout> (entity profiles), but simpler:
 *
 *   - Members have no server-resolved `can_review` permission field
 *     (only entity cards do), so this is a UX gate only — render for a
 *     signed-in viewer who is not the profile owner. The BACKEND
 *     enforces eligibility authoritatively (Level/tier gate, the
 *     Trusted/Elite downvote gate, the retaliation guard, self-review
 *     block) and returns `bcc_forbidden` etc., which the Composer's
 *     ReviewForm already humanizes.
 *   - No "remove your review" branch here — that lives on the entity
 *     surface; member-review removal can follow if needed.
 *
 * The page is a server component, so on close we `router.refresh()` to
 * re-render the profile shell with any fresh trust data (mirrors how
 * <ReviewCallout> refreshes). The ReviewForm itself invalidates the
 * member's reviews list on success.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Composer } from "@/components/composer/Composer";

interface MemberReviewControlProps {
  /** user_id of the member being reviewed (already loaded on the page). */
  userId: number;
  /** Display name shown in the composer header. */
  displayName: string;
}

export function MemberReviewControl({
  userId,
  displayName,
}: MemberReviewControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Write a review of ${displayName}.`}
        className="bcc-stencil mt-4 w-fit rounded-sm bg-cardstock px-4 py-2 text-[11px] tracking-[0.2em] text-ink ring-1 ring-cardstock-edge transition hover:bg-cardstock-deep"
      >
        REVIEW THIS MEMBER
      </button>

      {open && (
        <Composer
          variant="modal"
          defaultMode="review"
          reviewTargetUserId={userId}
          reviewTargetName={displayName}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
