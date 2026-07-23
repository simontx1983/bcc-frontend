"use client";

/**
 * ReviewCallout — "Write a review" / "Remove your review" CTA on
 * entity profiles AND member profiles (v1.49 consolidation — it
 * replaced the write-only MemberReviewControl).
 *
 * Sibling to <ClaimCallout> in IdentityBlock. Visible on every entity
 * profile (validator / project / creator) regardless of claim state —
 * a viewer can review a page even if its operator hasn't claimed it.
 * On /u/[handle] it renders for signed-in non-owners, fed from the
 * member hero card's now-real gate fields.
 *
 * State machine (driven entirely by server-resolved card fields per
 * §A2 — the client never re-derives gates):
 *
 *   anonymous              → "WRITE A REVIEW" disabled, sign-in tooltip
 *   has reviewed           → "REMOVE YOUR REVIEW" enabled, confirm-and-delete
 *                            (write_review gate intentionally NOT re-checked
 *                            here — removing your own work is always allowed
 *                            even if your tier later dropped below neutral)
 *   can review             → "WRITE A REVIEW" enabled, opens composer
 *   gated (level/tier)     → "WRITE A REVIEW" disabled, unlock-hint tooltip
 *
 * Targets are a discriminated union: entities carry the page id
 * directly; members carry the raw user id for the WRITE path (the
 * server resolves the self-page via ensureSelfPage) plus the card's
 * `review_target_id` (the self-page id) for the REMOVE path — the
 * client never derives ID_BASE itself (§L5). A member target without
 * `removePageId` (pre-v1.49 backend) degrades to write-only.
 *
 * On successful removal: invalidate the feed, highlights, and both
 * review lists (received tab + the author's Written tab), then
 * `router.refresh()` so the server component re-renders with
 * `viewer_has_reviewed` flipped.
 */

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";

import { Composer } from "@/components/composer/Composer";
import { humanizeCode } from "@/lib/api/errors";
import { removeReview } from "@/lib/api/posts-endpoints";
import { CARD_REVIEWS_QUERY_KEY_ROOT } from "@/hooks/useCardTabs";
import { FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_REVIEWS_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

export type ReviewCalloutTarget =
  | { kind: "entity"; pageId: number }
  | {
      kind: "member";
      userId: number;
      /** The member card's `review_target_id` (self-page id) — the
       *  DELETE /me/reviews/:id handle. Absent on a pre-v1.49 payload
       *  → the remove branch is suppressed (write-only degrade). */
      removePageId?: number | undefined;
    };

interface ReviewCalloutProps {
  target: ReviewCalloutTarget;
  /** Display name of the review subject (page name or member name). */
  pageName: string;
  canReview: boolean;
  /**
   * Server-supplied unlock hint from `card.permissions.can_review.unlock_hint`.
   * Phase γ UX cleanup: the previous hardcoded "Reviews unlock at Level 2
   * with reputation tier ≥ neutral" tooltip was a frontend mirror of a
   * backend gate — drift risk if the gate ever moves. The server now
   * resolves the unlock copy via `unlockHint(card.permissions, "can_review")`
   * at view-model assembly time. Null when allowed.
   */
  unlockHint: string | null;
  hasReviewed: boolean;
  viewerAuthed: boolean;
}

export function ReviewCallout({
  target,
  pageName,
  canReview,
  unlockHint,
  hasReviewed,
  viewerAuthed,
}: ReviewCalloutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The page id DELETE /me/reviews/:id takes. Entities: the card id.
  // Members: the card's review_target_id (self-page id) — undefined on
  // a pre-v1.49 payload, which suppresses the remove branch entirely.
  const removeId = target.kind === "entity" ? target.pageId : target.removePageId;

  // ── Deep-link auto-open ───────────────────────────────────────────
  // CardFactory's Review button pushes to `{entity-profile}?compose=review`
  // (server-resolved `card.links.review`). When the page loads with
  // that query param AND the viewer can write a review, auto-open the
  // composer and strip the param so a refresh doesn't re-open. We don't
  // auto-open for `hasReviewed` viewers — they either see the REMOVE
  // branch (removeId known) or, on a pre-v1.49 member payload, the
  // WRITE branch they can click manually; the param is stripped
  // without opening in both cases.
  useEffect(() => {
    if (searchParams === null) return;
    if (searchParams.get("compose") !== "review") return;
    if (!viewerAuthed || !canReview || hasReviewed) {
      // Strip the param anyway — leaving it sticky on a denied flow
      // would re-fire after every soft navigation that lands here.
      const next = new URLSearchParams(searchParams.toString());
      next.delete("compose");
      const qs = next.toString();
      router.replace((qs !== "" ? `${pathname}?${qs}` : pathname) as Route);
      return;
    }
    setOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("compose");
    const qs = next.toString();
    router.replace((qs !== "" ? `${pathname}?${qs}` : pathname) as Route);
  }, [searchParams, pathname, router, viewerAuthed, canReview, hasReviewed]);

  const handleRemove = async () => {
    if (!viewerAuthed || removeId === undefined) return;
    const ok = window.confirm(
      `Remove your review of ${pageName}? This drops your trust signal and deletes the body.`
    );
    if (!ok) return;

    setRemoving(true);
    setError(null);
    try {
      await removeReview(removeId);
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      // Both review lists go stale on remove: the subject's received
      // tab (entities/user_profile reviews) and the viewer's own
      // Written tab. Roots are coarse — cheap, and correctness beats
      // precision here.
      void queryClient.invalidateQueries({ queryKey: CARD_REVIEWS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: USER_REVIEWS_QUERY_KEY_ROOT });
      router.refresh();
    } catch (err) {
      setError(humanizeError(err));
      setRemoving(false);
    }
  };

  // ── Authed + has-reviewed → REMOVE YOUR REVIEW ─────────────────────
  // (Falls through to the write branch when removeId is unavailable —
  // pre-v1.49 member payloads — where re-submitting acts as a
  // review update, matching the old behavior.)
  if (viewerAuthed && hasReviewed && removeId !== undefined) {
    return (
      <>
        <button
          type="button"
          onClick={() => { void handleRemove(); }}
          disabled={removing}
          aria-disabled={removing}
          title={`Remove your review of ${pageName}.`}
          className={
            "bcc-stencil mt-4 w-fit rounded-sm px-4 py-2 text-[11px] tracking-[0.2em] transition " +
            (removing
              ? "cursor-wait bg-cardstock-deep/40 text-ink-soft/60"
              : "ring-1 ring-cardstock-edge bg-cardstock text-ink hover:bg-cardstock-deep")
          }
          style={
            !removing
              ? { boxShadow: "inset 0 -3px 0 var(--safety)" }
              : undefined
          }
        >
          {removing ? "REMOVING…" : "REMOVE YOUR REVIEW"}
        </button>
        {error !== null && (
          <p role="alert" className="bcc-mono mt-2 text-[11px] text-safety">
            {error}
          </p>
        )}
      </>
    );
  }

  // ── Default state → WRITE A REVIEW (enabled or visible-disabled) ──
  const enabled = viewerAuthed && canReview;
  const tooltip = !viewerAuthed
    ? "Sign in to write a review."
    : !canReview
      ? unlockHint ?? `You can't review ${pageName} yet — keep watching cards and posting on the Floor.`
      : `Write a review of ${pageName}.`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (enabled) setOpen(true);
        }}
        disabled={!enabled}
        aria-disabled={!enabled}
        title={tooltip}
        className={
          "bcc-stencil mt-4 w-fit rounded-sm px-4 py-2 text-[11px] tracking-[0.2em] transition " +
          (enabled
            ? "bg-cardstock text-ink ring-1 ring-cardstock-edge hover:bg-cardstock-deep"
            : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
        }
      >
        WRITE A REVIEW
      </button>

      {open && (
        <Composer
          variant="modal"
          defaultMode="review"
          {...(target.kind === "entity"
            ? { reviewTargetId: target.pageId }
            : { reviewTargetUserId: target.userId })}
          reviewTargetName={pageName}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      bcc_invalid_request: "Couldn't remove this review.",
      bcc_unavailable: "Review service is offline. Try again shortly.",
      bcc_rate_limited: "Too many attempts — wait a moment and retry.",
      bcc_not_found: "That review no longer exists.",
      bcc_forbidden: "You can't remove this review.",
    },
    "Couldn't remove your review. Try again.",
  );
}
