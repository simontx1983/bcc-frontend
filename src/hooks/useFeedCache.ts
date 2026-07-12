"use client";

/**
 * Feed-cache surgical-patch helpers.
 *
 * Shared utilities for mutations that change a single feed item's
 * `reactions` block (currently Stoke) WITHOUT invalidating the whole
 * feed namespace — a full invalidation would refetch the infinite
 * query and lose the viewer's scroll position. The pattern a mutation
 * follows:
 *
 *   1. snapshotMatchingPages → capture every infinite-query page that
 *      contains the target feed_id (restorable on error)
 *   2. patchFeedItem         → mutate the matching item's `reactions`
 *      block in place
 *   3. restoreSnapshots      → roll back on error
 *
 * Cache scope: all `["feed", ...]` infinite queries are scanned. The
 * viewer probably has at most 2-3 active at a time (different scope
 * tabs); per-mutation cost is bounded.
 *
 * These were extracted from the former reaction hooks. The reaction
 * rail was replaced by Stoke, so `useStoke` is the sole consumer today.
 * They're reaction-shape-agnostic — they locate an item by `id` and
 * replace its whole `reactions` block, whatever it contains.
 */

import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import type { FeedItem, FeedReactions, FeedResponse } from "@/lib/api/types";

export interface SetMutationContext {
  /** Snapshot of every feed page we touched, keyed by query key (JSON). */
  snapshots: Array<{ queryKey: readonly unknown[]; data: InfiniteData<FeedResponse> | undefined }>;
  /**
   * Snapshot of the `["feedItem", id]` single-post cache (the `/post/[id]`
   * detail view). Present whether or not that query exists — `data` is
   * `undefined` when it doesn't, which restores cleanly to "no entry".
   */
  single: { queryKey: readonly unknown[]; data: FeedItem | undefined };
}

/**
 * Snapshot every place the target item lives — feed pages AND the
 * single-post detail cache — so an optimistic patch is fully restorable
 * on error. Replaces the former `snapshotMatchingPages` (feed-only),
 * which left the detail view un-rolled-back.
 */
export function snapshotFeed(
  queryClient: QueryClient,
  feedId: string
): SetMutationContext {
  const queries = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
    queryKey: FEED_QUERY_KEY_ROOT,
  });

  const snapshots: SetMutationContext["snapshots"] = [];
  for (const [key, data] of queries) {
    if (data === undefined) continue;
    if (containsFeedId(data, feedId)) {
      snapshots.push({ queryKey: key, data });
    }
  }

  const singleKey = FEED_ITEM_QUERY_KEY(feedId);
  return {
    snapshots,
    single: { queryKey: singleKey, data: queryClient.getQueryData<FeedItem>(singleKey) },
  };
}

export function restoreFeed(
  queryClient: QueryClient,
  context: SetMutationContext | undefined
): void {
  if (context === undefined) return;
  for (const { queryKey, data } of context.snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
  queryClient.setQueryData(context.single.queryKey, context.single.data);
}

/**
 * Apply `update` (returns the new `reactions` block) to the matching item
 * everywhere it's cached: every feed-namespace infinite query AND the
 * `["feedItem", id]` detail cache. Patching both is what keeps the detail
 * view's rail live and in sync with the feed row after a Stoke.
 */
export function patchFeedItem(
  queryClient: QueryClient,
  feedId: string,
  update: (item: FeedItem) => FeedReactions
): void {
  queryClient.setQueriesData<InfiniteData<FeedResponse>>(
    { queryKey: FEED_QUERY_KEY_ROOT },
    (oldData) => {
      if (oldData === undefined) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === feedId
              ? { ...item, reactions: update(item) }
              : item
          ),
        })),
      };
    }
  );

  queryClient.setQueryData<FeedItem>(FEED_ITEM_QUERY_KEY(feedId), (old) =>
    old === undefined ? old : { ...old, reactions: update(old) }
  );
}

function containsFeedId(data: InfiniteData<FeedResponse>, feedId: string): boolean {
  for (const page of data.pages) {
    for (const item of page.items) {
      if (item.id === feedId) return true;
    }
  }
  return false;
}
