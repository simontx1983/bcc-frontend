"use client";

/**
 * DisputeCallout — owner-only "Open a Dispute" CTA on entity profiles.
 *
 * Sibling to <ClaimCallout> + <ReviewCallout> in IdentityBlock. Only
 * mounts when `card.permissions.can_dispute === true`, which the
 * server sets exclusively for the page owner. Non-owners never see
 * this button (vs. ReviewCallout, which shows-disabled for everyone
 * who hasn't unlocked reviews — disputes are owner-only and the
 * unreachable-by-design tooltip would just be noise).
 *
 * Click → opens <OpenDisputeModal>. Modal handles the full file flow
 * (pick a downvote → reason → submit) and drives its own invalidation.
 */

import { useState } from "react";

import { OpenDisputeModal } from "@/components/disputes/OpenDisputeModal";

interface DisputeCalloutProps {
  pageId: number;
  pageName: string;
  /** Server-resolved gate. Render-only when true. */
  canDispute: boolean;
}

export function DisputeCallout({
  pageId,
  pageName,
  canDispute,
}: DisputeCalloutProps) {
  const [open, setOpen] = useState(false);

  if (!canDispute) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Open a dispute against a downvote on ${pageName}.`}
        className="bcc-stencil mt-3 w-fit rounded-sm bg-cardstock px-4 py-2 text-[11px] tracking-[0.2em] text-ink ring-1 ring-cardstock-edge transition hover:bg-cardstock-deep"
        style={{ boxShadow: "inset 0 -3px 0 var(--safety)" }}
      >
        OPEN A DISPUTE
      </button>

      {open && (
        <OpenDisputeModal
          pageId={pageId}
          pageName={pageName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}