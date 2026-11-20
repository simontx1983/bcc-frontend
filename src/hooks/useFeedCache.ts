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
import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import type { FeedItem, FeedReactions, FeedResponse, RepostState } from "@/lib/api/types";

/**
 * Every infinite-query namespace that carries FeedResponse pages. The
 * group/Hall streams (`["groups","feed"]`, useGroupFeed) mirror the main
 * feed envelope exactly, so any snapshot that skips them leaves a
 * group-stream patch un-rolled-back on error.
 */
const FEED_PAGE_ROOTS = [FEED_QUERY_KEY_ROOT, GROUP_FEED_QUERY_KEY_ROOT] as const;

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
 * Snapshot every place the target item lives — feed pages (main AND
 * group-stream namespaces) plus the single-post detail cache — so an
 * optimistic patch is fully restorable on error. Replaces the former
 * `snapshotMatchingPages` (feed-only), which left the detail view
 * un-rolled-back; the group namespace joined 2026-08-06 alongside the
 * helpful-mark group-stream patch.
 */
export function snapshotFeed(
  queryClient: QueryClient,
  feedId: string
): SetMutationContext {
  const snapshots: SetMutationContext["snapshots"] = [];
  for (const root of FEED_PAGE_ROOTS) {
    const queries = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
      queryKey: root,
    });
    for (const [key, data] of queries) {
      if (data === undefined) continue;
      if (containsFeedId(data, feedId)) {
        snapshots.push({ queryKey: key, data });
      }
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
  // Both page namespaces — same roots snapshotFeed captures. Before
  // 2026-08-06 only the main feed was patched, so a Stoke inside a
  // community stream recorded server-side but stayed visually inert
  // until refetch (the gap the helpful-mark patch fixed first).
  for (const root of FEED_PAGE_ROOTS) {
    queryClient.setQueriesData<InfiniteData<FeedResponse>>(
      { queryKey: root },
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
  }

  queryClient.setQueryData<FeedItem>(FEED_ITEM_QUERY_KEY(feedId), (old) =>
    old === undefined ? old : { ...old, reactions: update(old) }
  );
}

/**
 * Every namespace a post can be listed in: the feed page roots above plus
 * the per-user profile walls (`["users","activity", handle]`, the same
 * FeedResponse envelope). A deleted post must leave all of them, otherwise
 * the stale row stays clickable and its detail route 404s.
 */
const FEED_LISTING_ROOTS = [...FEED_PAGE_ROOTS, USER_ACTIVITY_QUERY_KEY_ROOT] as const;

/**
 * F-346 — write a repost/quote response into every cached copy of its
 * root: the root itself, every repost of it (whose own repost fields are
 * keyed on the root too) and the nested `repost_of` copy, across every
 * listing and every `["feedItem", id]` detail cache. Items that do not
 * involve the root keep their reference, so memoized cards skip.
 */
export function patchRepostState(queryClient: QueryClient, state: RepostState): void {
  const root = state.root_feed_id;
  const fields = {
    repost_count: state.repost_count,
    quote_count: state.quote_count,
    viewer_has_reposted: state.viewer_has_reposted,
  };
  const patch = (item: FeedItem): FeedItem => {
    const nested = item.repost_of;
    const nestedHit = nested != null && nested.id === root;
    if (item.id !== root && !nestedHit) return item;
    return nestedHit ? { ...item, ...fields, repost_of: { ...nested, ...fields } } : { ...item, ...fields };
  };

  for (const listingRoot of FEED_LISTING_ROOTS) {
    queryClient.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: listingRoot }, (oldData) =>
      oldData === undefined
        ? oldData
        : {
            ...oldData,
            pages: oldData.pages.map((page) => ({ ...page, items: page.items.map(patch) })),
          },
    );
  }
  // Every detail cache: a repost's permalink holds the root nested inside it.
  queryClient.setQueriesData<FeedItem>({ queryKey: FEED_ITEM_QUERY_KEY("").slice(0, 1) }, (old) =>
    old === undefined || typeof old !== "object" || !("id" in old) ? old : patch(old),
  );
}

/**
 * Drop the item from every cached listing and clear its
 * `["feedItem", id]` detail cache. Used once the server has confirmed a
 * delete, so there is nothing to snapshot.
 */
export function removeFeedItem(queryClient: QueryClient, feedId: string): void {
  for (const root of FEED_LISTING_ROOTS) {
    queryClient.setQueriesData<InfiniteData<FeedResponse>>(
      { queryKey: root },
      (oldData) => {
        if (oldData === undefined) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== feedId),
          })),
        };
      }
    );
  }
  queryClient.removeQueries({ queryKey: FEED_ITEM_QUERY_KEY(feedId) });
}

function containsFeedId(data: InfiniteData<FeedResponse>, feedId: string): boolean {
  for (const page of data.pages) {
    for (const item of page.items) {
      if (item.id === feedId) return true;
    }
  }
  return false;
}
