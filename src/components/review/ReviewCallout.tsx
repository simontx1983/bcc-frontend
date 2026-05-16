"use client";

/**
 * ReviewCallout — "Write a review" / "Remove your review" CTA on
 * entity profiles.
 *
 * Sibling to <ClaimCallout> in IdentityBlock. Visible on every entity
 * profile (validator / project / creator) regardless of claim state —
 * a viewer can review a page even if its operator hasn't claimed it.
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
 * On successful removal: invalidate the React Query cache for this
 * card (so `viewer_has_reviewed` flips to false on next render) and
 * the feed (so the review item disappears or its trust delta refreshes).
 * The page is a server component, so we ALSO call `router.refresh()`
 * to re-render the EntityProfile shell with fresh card data.
 */

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";

import { Composer } from "@/components/composer/Composer";
import { humanizeCode } from "@/lib/api/errors";
import { removeReview } from "@/lib/api/posts-endpoints";
import { FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";

interface ReviewCalloutProps {
  pageId: number;
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
  pageId,
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

  // ── Deep-link auto-open ───────────────────────────────────────────
  // CardFactory's Review button pushes to `{entity-profile}?compose=review`
  // (server-resolved `card.links.review`). When the page loads with
  // that query param AND the viewer can write a review, auto-open the
  // composer and strip the param so a refresh doesn't re-open. We don't
  // gate on `hasReviewed` here — if the viewer landed via that link but
  // already has a review, the "REMOVE YOUR REVIEW" branch above renders
  // and the auto-open is a no-op (composer mode isn't shown).
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
    if (!viewerAuthed) return;
    const ok = window.confirm(
      `Remove your review of ${pageName}? This drops your trust signal and deletes the body.`
    );
    if (!ok) return;

    setRemoving(true);
    setError(null);
    try {
      await removeReview(pageId);
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      router.refresh();
    } catch (err) {
      setError(humanizeError(err));
      setRemoving(false);
    }
  };

  // ── Authed + has-reviewed → REMOVE YOUR REVIEW ─────────────────────
  if (viewerAuthed && hasReviewed) {
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
          reviewTargetId={pageId}
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
