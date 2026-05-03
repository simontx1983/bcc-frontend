"use client";

/**
 * useUserBlog — cursor-paginated hook for the per-user blog tab (§D6).
 *
 * Same TanStack `useInfiniteQuery` pattern as useFeed/useHotFeed; the
 * difference is the URL scope (per-handle) and the body shape — feed
 * items returned here carry `body.full_text` populated, not just an
 * excerpt. The Blog tab page renders bodies in full.
 *
 * Cache key includes the handle so swapping users while pages are
 * still in flight doesn't bleed across queries.
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { getUserBlog } from "@/lib/api/blog-endpoints";
import type { BccApiError, FeedResponse } from "@/lib/api/types";

const PAGE_SIZE = 20;

export const USER_BLOG_QUERY_KEY_ROOT = ["users", "blog"] as const;

export function useUserBlog(handle: string) {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...USER_BLOG_QUERY_KEY_ROOT, handle],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getUserBlog(
        { handle, cursor: pageParam, limit: PAGE_SIZE },
        signal,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: handle !== "",
    staleTime: 30_000,
  });
}
