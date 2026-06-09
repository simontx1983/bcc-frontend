"use client";

/**
 * CardGrid — presentational card grid with viewer-watch wiring.
 *
 * Extracted from `DirectoryGrid` so the same CardFactory-grid-with-watch
 * body renders at every member/entity card surface (the /members
 * directory, the entity "Watchers" panel, the profile "Watching" panel)
 * without duplicating the watch plumbing or the `auto-fit,316px` grid.
 *
 * Owns:
 *   - the viewer's watchlist read (`useWatching`) + the watch/unwatch
 *     mutations, mapped to a `${kind}-${id}` follow lookup so each
 *     card's "Keep Tabs" CTA reflects current state and toggles
 *     correctly (POST vs DELETE).
 *   - the responsive `[grid-template-columns:repeat(auto-fit,316px)]`
 *     track (cards are a fixed 316px; the perspective + 3D flip rely on
 *     a stable width).
 *
 * Does NOT own:
 *   - data fetching / pagination — the caller passes a flat `cards`
 *     array (DirectoryGrid flattens its infinite query; the panels
 *     accumulate offset pages).
 *
 * Each card is wrapped in a `memo()`'d cell keyed by `${kind}-${id}` so
 * a watchlist change or a sibling re-render doesn't re-render every
 * card. Callback props are stable (`useCallback`).
 */

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { CardFactory } from "@/components/cards/CardFactory";
import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import type { Card, WatchingFollowSource } from "@/lib/api/types";

interface CardGridProps {
  cards: Card[];
  /**
   * Optional review-composer override. When omitted, CardFactory falls
   * back to navigating to the card's server-supplied review link. The
   * directory passes its own handler; the watching panels rely on the
   * default navigation.
   */
  onReview?: ((card: Card) => void) | undefined;
}

/** A single row in the followMap. Carries enough state for the DELETE
 *  call to know which table to delete from (peepso vs. page-follow),
 *  since IDs collide across the two auto-increment ranges. */
interface FollowMapEntry {
  follow_id: number;
  source: WatchingFollowSource;
}

/** Build a "{kind}-{id}" → {follow_id, source} lookup from the viewer's
 *  watchlist so each card can render its current watched state and the
 *  toggle handler can pick between watch (POST) and unwatch (DELETE)
 *  without an extra round-trip. Empty for anonymous viewers.
 *
 *  Key choice: `Card.id` is the wp_post ID for validator/project/creator
 *  cards and the user ID for member cards. `WatchingItem.card_id` is a
 *  different internal identifier; `page_id` IS the wp_post ID when set —
 *  so we key on page_id when present and fall back to card_id otherwise. */
function buildFollowMap(
  items: ReadonlyArray<{
    card_kind: string;
    card_id: number;
    page_id: number | null;
    follow_id: number;
    follow_source?: WatchingFollowSource;
  }>,
): Map<string, FollowMapEntry> {
  const map = new Map<string, FollowMapEntry>();
  for (const item of items) {
    const idKey = item.page_id !== null ? item.page_id : item.card_id;
    map.set(`${item.card_kind}-${idKey}`, {
      follow_id: item.follow_id,
      source: item.follow_source ?? "peepso",
    });
  }
  return map;
}

export function CardGrid({ cards, onReview }: CardGridProps) {
  const router = useRouter();
  // page_size capped at 50 server-side; users typically follow a
  // handful, so one page is enough. If a heavy follower has 50+ watches
  // the un-mapped ones simply render as "Keep Tabs" again — a refresh
  // post-action restores accuracy.
  const watchingQuery = useWatching({ page_size: 50 });
  const pullMutation = useWatchMutation();
  const unpullMutation = useUnwatchMutation();

  const followMap = useMemo(
    () => buildFollowMap(watchingQuery.data?.items ?? []),
    [watchingQuery.data],
  );

  const handlePull = useCallback(
    (card: Card): void => {
      const key = `${card.card_kind}-${card.id}`;
      const entry = followMap.get(key);
      if (entry !== undefined) {
        unpullMutation.mutate({ follow_id: entry.follow_id, source: entry.source });
      } else {
        pullMutation.mutate({ target_kind: card.card_kind, target_id: card.id });
      }
    },
    [followMap, pullMutation, unpullMutation],
  );

  const handleReview = useCallback(
    (card: Card): void => {
      if (onReview !== undefined) {
        onReview(card);
        return;
      }
      // Server tells us where the review composer lives — never derive
      // the URL on the client (§A2/§L5). Falls back to the card profile
      // when the field isn't set (defensive; the server always emits it).
      const href = card.links.review ?? card.links.self;
      router.push(href as Route);
    },
    [onReview, router],
  );

  return (
    // `bcc-card` is a fixed 316px wide (perspective + 3D flip rely on a
    // stable card width). An `auto-fit` track packs only as many 316px
    // columns as the available width admits, so cards never overlap
    // regardless of sidebar / breakpoint. `justify-center` centers any
    // leftover space when the row isn't full.
    <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]">
      {cards.map((card) => {
        const key = `${card.card_kind}-${card.id}`;
        return (
          <CardGridCell
            key={key}
            card={card}
            isPulled={followMap.has(key)}
            onPull={handlePull}
            onReview={handleReview}
          />
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CardGridCell — memoized per-card cell. Re-renders only when its own
// card / pulled-state / stable callbacks change, so a watchlist toggle
// doesn't re-render the whole grid.
// ─────────────────────────────────────────────────────────────────────

const CardGridCell = memo(function CardGridCell({
  card,
  isPulled,
  onPull,
  onReview,
}: {
  card: Card;
  isPulled: boolean;
  onPull: (card: Card) => void;
  onReview: (card: Card) => void;
}) {
  return (
    <li>
      <CardFactory
        card={card}
        isPulled={isPulled}
        onPull={onPull}
        onReview={onReview}
      />
    </li>
  );
});
