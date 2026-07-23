"use client";

/**
 * ActionBar — the action band along the bottom of the card's front
 * face (Keep Tabs / Review / View profile). Extracted from
 * CardFactory.tsx (Phase 3.3 god-component split).
 *
 * Watch fallback (2026-07-23): like the Review button before it, the
 * Keep Tabs button was a SILENT NO-OP on every surface that didn't
 * wire `onPull` — which was every profile hero card (entity AND /u
 * member pages; only the directory grids wired it). When no `onPull`
 * override is supplied, the bar now composes the same primitives
 * CardGrid uses: the shared `useWatching` query (React Query dedupes
 * it against the grids' identical key, and it self-gates on session)
 * resolves the true watching state + follow_id, and the watch/unwatch
 * mutations toggle it. Hosts that pass `onPull` are untouched.
 */

import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import { useWatching } from "@/hooks/useWatching";
import type { Card, CardCommunityDossier } from "@/lib/api/types";
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

  // ── Watch fallback (no onPull wired) ─────────────────────────────
  // Same follow-map semantics as CardGrid's buildFollowMap: a watching
  // row matches this card when kinds agree and (page_id ?? card_id)
  // equals card.id. The query self-gates on session, so anon viewers
  // never fire it (their button is server-disabled via can_watch).
  const watchFallbackActive = onPull === undefined;
  const watchingQuery = useWatching({ page_size: 50 });
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();
  const fallbackEntry = useMemo(() => {
    if (!watchFallbackActive) return undefined;
    const items = watchingQuery.data?.items ?? [];
    const hit = items.find(
      (item) =>
        item.card_kind === card.card_kind &&
        (item.page_id !== null ? item.page_id : item.card_id) === card.id
    );
    return hit !== undefined
      ? { follow_id: hit.follow_id, source: hit.follow_source ?? "peepso" }
      : undefined;
  }, [watchFallbackActive, watchingQuery.data, card.card_kind, card.id]);
  // Hosts that own optimistic state pass isPulled; the fallback derives
  // it from the watching query (flips after the mutation's namespace
  // invalidation refetches — same cadence the grids have).
  const effectivePulled = watchFallbackActive ? fallbackEntry !== undefined : isPulled;
  const handleWatchClick = () => {
    if (onPull !== undefined) {
      onPull(card);
      return;
    }
    if (watchMutation.isPending || unwatchMutation.isPending) return;
    if (fallbackEntry !== undefined) {
      unwatchMutation.mutate({ follow_id: fallbackEntry.follow_id, source: fallbackEntry.source });
    } else {
      watchMutation.mutate({ target_kind: card.card_kind, target_id: card.id });
    }
  };

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
        disabled={!isAllowed(card.permissions, "can_watch")}
        title={
          isAllowed(card.permissions, "can_watch")
            ? effectivePulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : unlockHint(card.permissions, "can_watch") ??
              "Keep Tabs is unavailable for this card."
        }
        onClick={(e) => {
          stop(e);
          handleWatchClick();
        }}
        className="bcc-stencil flex h-11 items-center justify-center bg-ink text-cardstock transition-colors disabled:cursor-not-allowed"
      >
        {effectivePulled ? (
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

// ─────────────────────────────────────────────────────────────────────
// CommunityActionBar — the community-card variant of the action band.
// Two cells: JOIN (state machine over the server dossier) + OPEN.
// ─────────────────────────────────────────────────────────────────────

/**
 * JOIN-cell state machine. Branches ONLY on `card.community_dossier`
 * (§A2 — the server already resolved membership/gating; nothing here
 * recomputes eligibility):
 *
 *   viewer_is_member (or optimistic isJoined) → MEMBER ✓   (no-op)
 *   nft, not a member                         → CHECK & JOIN (onJoin)
 *   trust-gated non-member                    → JOIN (enabled — the
 *                                               server adjudicates the
 *                                               threshold on the POST)
 *   local / open plain group                  → JOIN
 *   closed non-trust                          → PRIVATE   (disabled)
 *   secret                                    → INVITE-ONLY (disabled)
 *
 * Pending state renders CHECKING… on the NFT path (a speculative
 * on-chain ownership check) and JOINING… everywhere else.
 *
 * Every click stops propagation so actions never flip the card.
 */
export function CommunityActionBar({
  card,
  dossier,
  onJoin,
  isJoined,
  joinPending,
  hideOpenAction,
}: {
  card: Card;
  dossier: CardCommunityDossier;
  onJoin?: ((card: Card) => void) | undefined;
  isJoined: boolean;
  joinPending: boolean;
  hideOpenAction?: boolean;
}) {
  const stop = (event: MouseEvent) => event.stopPropagation();
  const openHref = card.links.self as Route;
  const cols = hideOpenAction === true ? "" : " sm:grid-cols-2";

  const isMember = dossier.viewer_is_member || isJoined;
  const isNft = dossier.type === "nft";

  let joinCell: ReactNode;
  if (isMember) {
    joinCell = (
      <button
        type="button"
        onClick={stop}
        title="You're a member — manage membership on the community page."
        className="bcc-stencil flex h-11 cursor-default items-center justify-center bg-ink text-cardstock"
      >
        MEMBER ✓
      </button>
    );
  } else if (
    dossier.type !== "nft" &&
    dossier.trust_min === null &&
    dossier.privacy === "closed"
  ) {
    joinCell = (
      <button
        type="button"
        disabled
        onClick={stop}
        title="Request to join on the community page."
        className="bcc-stencil flex h-11 items-center justify-center bg-cardstock text-ink opacity-40 disabled:cursor-not-allowed"
      >
        PRIVATE
      </button>
    );
  } else if (dossier.type !== "nft" && dossier.privacy === "secret") {
    joinCell = (
      <button
        type="button"
        disabled
        onClick={stop}
        title="Members join by invitation."
        className="bcc-stencil flex h-11 items-center justify-center bg-cardstock text-ink opacity-40 disabled:cursor-not-allowed"
      >
        INVITE-ONLY
      </button>
    );
  } else {
    // NFT (CHECK & JOIN), trust-gated, local, or open plain group —
    // all enabled; the server owns the final yes/no when the join fires.
    const idleLabel = isNft ? "CHECK & JOIN" : "JOIN";
    const pendingLabel = isNft ? "CHECKING…" : "JOINING…";
    joinCell = (
      <button
        type="button"
        disabled={joinPending}
        title={
          isNft
            ? "Verifies your linked wallet holds this collection, then joins."
            : "Join this community."
        }
        onClick={(e) => {
          stop(e);
          if (onJoin !== undefined) onJoin(card);
        }}
        className="bcc-stencil flex h-11 items-center justify-center bg-ink text-cardstock transition-colors hover:bg-safety disabled:cursor-wait disabled:opacity-70"
      >
        {joinPending ? pendingLabel : idleLabel}
      </button>
    );
  }

  return (
    <div
      className={`relative z-10 grid grid-cols-1 border-t border-cardstock-edge/40 bg-cardstock${cols}`}
    >
      {joinCell}

      {hideOpenAction !== true && (
        <Link
          href={openHref}
          onClick={stop}
          title={`Open ${card.name}`}
          aria-label={`Open ${card.name}`}
          className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-safety text-center text-cardstock transition hover:bg-ink"
        >
          Open
        </Link>
      )}
    </div>
  );
}
