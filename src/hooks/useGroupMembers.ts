"use client";

/**
 * useGroupMembers — offset-paginated group roster hook (§4.7.7).
 *
 * Built on TanStack `useInfiniteQuery` so "load more" is a single
 * `fetchNextPage()` call. Unlike `useFeed`, the server returns
 * offset-based pagination here (the roster is stable-ordered by
 * (role_rank, joined_at DESC) so offset paginates correctly without
 * timestamp drift).
 *
 * `getNextPageParam` returns the next offset when `has_more` is true,
 * or `undefined` when exhausted (TanStack's signal to stop offering a
 * next page).
 *
 * Caller is responsible for gating: only mount this hook when
 * `group.members_visible === true`. The server returns 403
 * `bcc_permission_denied` for non-members of closed groups, which
 * surfaces as a typed `BccApiError` — the roster-private notice
 * should render upstream of this hook so that 403 never hits the wire.
 *
 * Stale time: 60s. Roster turnover is slower than the feed, so a
 * longer window is appropriate; a join/leave on the active page
 * still invalidates explicitly.
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { bccFetchAsClient } from "@/lib/api/client";
import type { BccApiError, GroupMembersResponse } from "@/lib/api/types";

const PAGE_SIZE = 24;

/** Root key — exported so other code can invalidate the namespace. */
export const GROUP_MEMBERS_QUERY_KEY_ROOT = ["groups", "members"] as const;

export function useGroupMembers(groupId: number) {
  return useInfiniteQuery<
    GroupMembersResponse,
    BccApiError,
    InfiniteData<GroupMembersResponse>,
    QueryKey,
    number
  >({
    queryKey: [...GROUP_MEMBERS_QUERY_KEY_ROOT, groupId],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      bccFetchAsClient<GroupMembersResponse>(
        buildPath(groupId, pageParam, PAGE_SIZE),
        { method: "GET", signal }
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more
        ? lastPage.pagination.offset + lastPage.pagination.limit
        : undefined,
    enabled: groupId > 0,
    staleTime: 60_000,
  });
}

function buildPath(groupId: number, offset: number, limit: number): string {
  const search = new URLSearchParams();
  if (offset > 0) {
    search.set("offset", String(offset));
  }
  if (limit > 0) {
    search.set("limit", String(limit));
  }
  const qs = search.toString();
  return qs === "" ? `groups/${groupId}/members` : `groups/${groupId}/members?${qs}`;
}
