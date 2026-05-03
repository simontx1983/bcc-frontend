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
 * Stale time: 30s. Feeds are time-sensitive but not real-time; the
 * brief stale window matches the server's `Cache-Control: max-age=15
 * / 60` and the user's perception of "fresh enough."
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { getFeed, getHotFeed, type FeedQueryParams } from "@/lib/api/feed-endpoints";
import type { BccApiError, FeedResponse, FeedScope } from "@/lib/api/types";

const PAGE_SIZE = 20;

/** Root keys — exported so other code can invalidate the namespace. */
export const FEED_QUERY_KEY_ROOT = ["feed"] as const;
export const HOT_FEED_QUERY_KEY = ["feed", "hot"] as const;

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
    staleTime: 30_000,
  });
}

function buildParams(cursor: string | null): FeedQueryParams {
  return {
    cursor,
    limit: PAGE_SIZE,
  };
}
