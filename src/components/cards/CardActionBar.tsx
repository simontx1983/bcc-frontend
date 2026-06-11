"use client";

/**
 * ActionBar — the action band along the bottom of the card's front
 * face (Keep Tabs / Review / View profile). Extracted from
 * CardFactory.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged.
 */

import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

import type { Card } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";
import { isAllowed, unlockHint } from "@/lib/permissions";

export function ActionBar({
  card,
  onPull,
  onReview,
  isPulled,
  hideOpenAction,
}: {
  card: Card;
  onPull?: ((card: Card) => void) | undefined;
  onReview?: ((card: Card) => void) | undefined;
  isPulled: boolean;
  /** When true, the "View profile" cell is dropped from the action bar.
   *  Used on the profile page itself — the link would loop back to the
   *  same URL. Grid switches to 2-col when this is true. */
  hideOpenAction?: boolean;
}) {
  // Action buttons sit on a thin band along the bottom of the front
  // face. Per §N7 every gated action is ALWAYS visible — disabled
  // (with a tooltip) when permissions deny. Hidden actions teach the
  // user nothing.
  const stop = (event: MouseEvent) => event.stopPropagation();

  // The Open destination is a server-supplied path. With typedRoutes
  // enabled we can't statically prove it's a valid app route, so we
  // cast through `Route` — the WP backend is the authority on these
  // URLs (per §A4).
  const openHref = card.links.self as Route;

  // Default Review navigation — server-supplied `card.links.review`
  // (`{entity-profile}?compose=review`) when present, otherwise the
  // card's profile URL. Used when no `onReview` override is wired
  // (most CardFactory call sites). The entity profile's
  // ReviewCallout reads the query param on mount and auto-opens
  // the composer. Without this fallback the Review button was a
  // no-op on every surface except DirectoryGrid.
  const router = useRouter();
  const handleReviewClick = () => {
    if (onReview !== undefined) {
      onReview(card);
      return;
    }
    const href = (card.links.review ?? card.links.self) as Route;
    router.push(href);
  };

  const cols = hideOpenAction === true ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className={`relative z-10 grid grid-cols-1 border-t border-cardstock-edge/40 bg-cardstock ${cols}`}>
      <button
        type="button"
        disabled={!isAllowed(card.permissions, "can_pull")}
        title={
          isAllowed(card.permissions, "can_pull")
            ? isPulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : unlockHint(card.permissions, "can_pull") ??
              "Keep Tabs is unavailable for this card."
        }
        onClick={(e) => {
          stop(e);
          if (onPull !== undefined) onPull(card);
        }}
        className="bcc-stencil flex h-11 items-center justify-center bg-ink text-cardstock transition-colors disabled:cursor-not-allowed"
      >
        {isPulled ? (
          <>
            {/* Active state — desktop variant; "Keeping Tabs ✓" overflows the
                grid-cols-3 cell on <375px viewports, so we swap to the state
                word "Watching ✓" below sm (matches the previous button width). */}
            <span className="hidden sm:inline">{FOLLOW_COPY.ctaActiveDesktop}</span>
            <span className="sm:hidden">{FOLLOW_COPY.ctaActiveMobile}</span>
          </>
        ) : (
          FOLLOW_COPY.cta
        )}
      </button>

      <button
        type="button"
        disabled={!isAllowed(card.permissions, "can_review")}
        title={
          isAllowed(card.permissions, "can_review")
            ? "Write a review"
            : unlockHint(card.permissions, "can_review") ??
              "Reviews unlock at neutral reputation."
        }
        onClick={(e) => {
          stop(e);
          handleReviewClick();
        }}
        className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-cardstock text-ink transition-colors hover:bg-ink hover:text-cardstock disabled:opacity-40"
      >
        Review
      </button>

      {/* The primary navigation affordance on the card — promoted to
          safety-orange so it reads as the "do this next" action rather
          than just one of three same-weight buttons. Hidden on the
          profile page itself (hideOpenAction=true) since the link
          would loop back to the same URL. */}
      {hideOpenAction !== true && (
        <Link
          href={openHref}
          onClick={stop}
          title="View this profile"
          aria-label={`View ${card.name}'s profile`}
          className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-safety text-center text-cardstock transition hover:bg-ink"
        >
          View profile
        </Link>
      )}
    </div>
  );
}
