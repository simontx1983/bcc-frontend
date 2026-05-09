"use client";

/**
 * useGroupFeed — cursor-paginated group-scoped feed hook.
 *
 * Mirrors `useFeed` / `useHotFeed` exactly (same envelope, same
 * `getNextPageParam` shape, same 30s stale window). Backed by
 * `GET /bcc/v1/groups/{id}/feed` per §4.7.6.
 *
 * Caller is responsible for gating: only mount this hook when
 * `group.feed_visible === true`. The server returns 403
 * `bcc_permission_denied` for non-members of NFT/closed groups, which
 * surfaces as a typed `BccApiError` — the gated-notice fallback
 * should render upstream of this hook so that 403 never hits the wire.
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { getGroupFeed } from "@/lib/api/groups-detail-endpoints";
import { bccFetchAsClient } from "@/lib/api/client";
import type { BccApiError, FeedResponse } from "@/lib/api/types";

const PAGE_SIZE = 20;

/** Root key — exported so other code can invalidate the namespace. */
export const GROUP_FEED_QUERY_KEY_ROOT = ["groups", "feed"] as const;

export function useGroupFeed(groupId: number) {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...GROUP_FEED_QUERY_KEY_ROOT, groupId],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      // Client-side path: route through `bccFetchAsClient` so the
      // browser session JWT is forwarded automatically. The shared
      // `getGroupFeed` wrapper is server-safe; we replicate its tiny
      // path-building inline here rather than threading a token
      // through every consumer.
      bccFetchAsClient<FeedResponse>(
        buildPath(groupId, pageParam, PAGE_SIZE),
        { method: "GET", signal }
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: groupId > 0,
    staleTime: 30_000,
  });
}

// `getGroupFeed` is exported as the SSR-safe path for other callers.
// Keep it referenced here so a future SSR-prefetch (deferred) can
// reuse the same wrapper without a duplicate path-builder.
void getGroupFeed;

function buildPath(groupId: number, cursor: string | null, limit: number): string {
  const search = new URLSearchParams();
  if (cursor !== null && cursor !== "") {
    search.set("cursor", cursor);
  }
  if (limit > 0) {
    search.set("limit", String(limit));
  }
  const qs = search.toString();
  return qs === "" ? `groups/${groupId}/feed` : `groups/${groupId}/feed?${qs}`;
}
