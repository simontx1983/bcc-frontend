"use client";

/**
 * useFeed / useHotFeed — cursor-paginated feed hooks.
 *
 * Built on TanStack `useInfiniteQuery` so "load more" is a single
 * `fetchNextPage()` call, and React Query handles dedup + cache
 * coherence across pages.
 *
 * Backend cursor contract (§F3, locked):
 *   pagination: { next_cursor: string | null, has_more: boolean }
 *
 * `getNextPageParam` returns the cursor when `has_more` is true, or
 * `undefined` when exhausted (TanStack's signal to stop offering
 * a next page).
 *
 * Stale time aligns to the server's `Cache-Control: max-age=15 / 60`:
 * the hot feed (ranked, time-sensitive, max-age=15) stays at 30s, while
 * the standard chronological + tag feeds (max-age=60) use 60s. Feeds
 * carry no `refetchInterval`, so staleTime only governs refetch on
 * remount/navigation — a longer window cuts redundant back-nav fetches
 * without making anything feel stale.
 */

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import {
  getFeed,
  getFeedItemByIdAsClient,
  getHotFeed,
  getTagFeed,
  type FeedQueryParams,
} from "@/lib/api/feed-endpoints";
import type { BccApiError, FeedItem, FeedResponse, FeedScope } from "@/lib/api/types";

const PAGE_SIZE = 20;

/** Root keys — exported so other code can invalidate the namespace. */
export const FEED_QUERY_KEY_ROOT = ["feed"] as const;
export const HOT_FEED_QUERY_KEY = ["feed", "hot"] as const;

/**
 * Single-item cache key — the `/post/[id]` detail view's reactive slot.
 * Separate namespace from `["feed", …]` so it isn't swept by feed
 * invalidations; the stoke/reaction cache helpers patch it explicitly
 * (see useFeedCache) so the detail view's rail stays in sync with the
 * feed row.
 */
export const FEED_ITEM_QUERY_KEY = (id: string) => ["feedItem", id] as const;

/**
 * useFeedItem — reactive read of one post for the permalink detail view.
 *
 * The `/post/[id]` server page fetches the item and passes it as
 * `initialData`, so this renders instantly with no client fetch and no
 * loading flash. Its real job is to give the detail view a React Query
 * cache entry that mutations (Stoke, comments) can patch — the old
 * static server prop couldn't reflect a toggle, which is why the rail
 * looked dead in the detail view. `staleTime` keeps the SSR snapshot
 * authoritative for a minute rather than refetching on mount.
 */
export function useFeedItem(id: string, initialData: FeedItem) {
  return useQuery<FeedItem, BccApiError>({
    queryKey: FEED_ITEM_QUERY_KEY(id),
    queryFn: ({ signal }) => getFeedItemByIdAsClient(id, signal),
    initialData,
    staleTime: 60_000,
  });
}

export function useHotFeed() {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: HOT_FEED_QUERY_KEY,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getHotFeed(buildParams(pageParam), signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    staleTime: 30_000,
  });
}

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...FEED_QUERY_KEY_ROOT, scope],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getFeed(scope, buildParams(pageParam), signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    staleTime: 60_000,
  });
}

/**
 * useTagFeed — cursor-paginated feed of posts carrying a PeepSo hashtag.
 * Mirrors useFeed exactly; the only differences are the queryKey
 * (namespaced by tag), the queryFn target (getTagFeed), and the
 * `enabled` guard so an empty tag never fires a request.
 */
export function useTagFeed(tag: string) {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...FEED_QUERY_KEY_ROOT, "tag", tag],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getTagFeed(tag, buildParams(pageParam), signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    staleTime: 60_000,
    enabled: tag.length > 0,
  });
}

function buildParams(cursor: string | null): FeedQueryParams {
  return {
    cursor,
    limit: PAGE_SIZE,
  };
}
