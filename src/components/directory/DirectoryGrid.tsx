"use client";

/**
 * DirectoryGrid — paginated card grid for the §G1/§G2 directory.
 *
 * Renders the flat list of Cards from `useDirectory` as a responsive
 * grid of <CardFactory> instances and exposes a "Load more" button
 * that hits `fetchNextPage()`. Pagination is page-based (1..20 hard
 * cap server-side); when `hasNextPage` flips to false the button
 * disappears.
 *
 * States:
 *   - loading-initial → skeleton row of placeholder tiles
 *   - error           → inline message with no retry button (the
 *                       parent's filter changes refresh the query
 *                       naturally; spurious retries bury real fixes)
 *   - empty           → §N10 empty-state copy with a hint to widen
 *                       the filter set
 *   - has-data        → grid + load-more
 *   - loading-more    → grid + spinner-state on button
 *
 * Card actions:
 *   - Keep Tabs → toggles the viewer's follow on the card via
 *     watch/unwatch mutations; `isPulled` derives from the watching
 *     query so the button label reflects current state.
 *   - Review → navigates to the card's profile in compose mode,
 *     letting the destination page handle the composer modal.
 *   - View profile → handled inside CardFactory (Link).
 */

import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMemo } from "react";

import { CardFactory } from "@/components/cards/CardFactory";
import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import type {
  BccApiError,
  WatchingFollowSource,
  Card,
  CardsListResponse,
} from "@/lib/api/types";

interface Props {
  query: UseInfiniteQueryResult<InfiniteData<CardsListResponse>, BccApiError>;
}

/** A single row in the followMap. Carries enough state for the
 *  DELETE call to know which table to delete from (peepso vs. page-
 *  follow), since IDs collide across the two auto-increment ranges. */
interface FollowMapEntry {
  follow_id: number;
  source: WatchingFollowSource;
}

/** Build a "{kind}-{id}" → {follow_id, source} lookup from the
 *  viewer's watchlist so each card can render its current watched state
 *  and the toggle handler can pick between watch (POST) and unwatch
 *  (DELETE) without an extra round-trip. Empty for anonymous viewers.
 *
 *  Key choice: `Card.id` from the cards-list endpoint is the wp_post
 *  ID for validator/project/creator cards. `WatchingItem.card_id` is a
 *  different internal identifier (page-score ID for peepso source,
 *  the page itself for page-follow source). `page_id` IS the wp_post
 *  ID in both cases — so we key on page_id when present and fall
 *  back to card_id for non-page kinds (member). */
function buildFollowMap(items: ReadonlyArray<{
  card_kind: string;
  card_id: number;
  page_id: number | null;
  follow_id: number;
  follow_source?: WatchingFollowSource;
}>): Map<string, FollowMapEntry> {
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

export function DirectoryGrid({ query }: Props) {
  const router = useRouter();
  // page_size capped at 50 server-side; users typically follow a
  // handful, so one page is enough. If a heavy follower has 50+ watches
  // the un-mapped ones simply render as "Keep Tabs" again — a refresh
  // post-action restores accuracy. V1 tradeoff vs. paginating the
  // watching fetch here.
  const watchingQuery = useWatching({ page_size: 50 });
  const pullMutation = useWatchMutation();
  const unpullMutation = useUnwatchMutation();

  const followMap = useMemo(
    () => buildFollowMap(watchingQuery.data?.items ?? []),
    [watchingQuery.data]
  );

  const handlePull = (card: Card): void => {
    const key = `${card.card_kind}-${card.id}`;
    const entry = followMap.get(key);
    if (entry !== undefined) {
      unpullMutation.mutate({ follow_id: entry.follow_id, source: entry.source });
    } else {
      pullMutation.mutate({ target_kind: card.card_kind, target_id: card.id });
    }
  };

  const handleReview = (card: Card): void => {
    // Server tells us where the review composer lives — never derive
    // the URL on the client (§A2/§L5). Falls back to the card profile
    // when the field isn't set (defensive; the server always emits it).
    const href = card.links.review ?? card.links.self;
    router.push(href as Route);
  };

  if (query.isError) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-6 text-center">
        <p className="font-serif text-sm text-ink-soft">
          The directory hit a snag. Try a different filter or refresh in a moment.
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <ul
        aria-label="Loading directory results"
        className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]"
      >
        {Array.from({ length: 8 }).map((_, idx) => (
          <li
            key={idx}
            aria-hidden
            className="bcc-panel h-[460px] animate-pulse opacity-40"
          />
        ))}
      </ul>
    );
  }

  // Flatten pages into a single Card[]. Each page is an independent
  // CardsListResponse — concat in order.
  const items: Card[] = (query.data?.pages ?? []).flatMap((p) => p.items);

  if (items.length === 0) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-8 text-center">
        <p className="bcc-mono text-safety">NO MATCHES</p>
        <h2 className="bcc-stencil mt-2 text-3xl text-ink">
          Filter&rsquo;s too tight.
        </h2>
        <p className="mt-3 font-serif leading-relaxed text-ink-soft">
          Drop a tier, switch the kind, or clear the search. Plenty more
          on the floor.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* `bcc-card` is a fixed 316px wide (perspective + 3D flip rely on
          a stable card width). An `auto-fit` track packs only as many
          316px columns as the available width admits, so cards never
          overlap regardless of sidebar / breakpoint. `justify-center`
          centers any leftover space when the row isn't full. */}
      <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]">
        {items.map((card) => {
          const key = `${card.card_kind}-${card.id}`;
          const isPulled = followMap.has(key);
          return (
            <li key={key}>
              <CardFactory
                card={card}
                isPulled={isPulled}
                onPull={handlePull}
                onReview={handleReview}
              />
            </li>
          );
        })}
      </ul>

      {query.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className={
              "bcc-stencil rounded-sm px-6 py-3 text-[12px] tracking-[0.2em] transition " +
              (query.isFetchingNextPage
                ? "cursor-wait bg-cardstock-deep/40 text-ink-soft/60"
                : "bg-ink text-cardstock hover:bg-ink-soft")
            }
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        </div>
      )}
    </>
  );
}
