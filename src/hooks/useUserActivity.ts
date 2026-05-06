"use client";

/**
 * useUserReviews / useUserDisputes / useUserActivity — lazy-load hooks
 * for the /u/[handle] profile tabs.
 *
 * Reviews + Disputes use §V1.5 single-page fetches (offset pagination,
 * directory-style list). Activity uses the §F3 cursor pattern shared
 * with the Floor feed — `useInfiniteQuery` so "Load more" is a single
 * `fetchNextPage()` call.
 *
 * `enabled` gates on a non-empty handle on all three so swapping users
 * mid-render doesn't briefly fire a request to /users//<tab>.
 */

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import {
  getUserActivity,
  getUserDisputes,
  getUserGroups,
  getUserReviews,
  type ActivityQueryParams,
} from "@/lib/api/user-activity-endpoints";
import type {
  BccApiError,
  FeedResponse,
  UserDisputesResponse,
  UserGroupsResponse,
  UserReviewsResponse,
} from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;
const ACTIVITY_PAGE_SIZE = 20;

export const USER_REVIEWS_QUERY_KEY_ROOT = ["users", "reviews"] as const;
export const USER_DISPUTES_QUERY_KEY_ROOT = ["users", "disputes"] as const;
export const USER_ACTIVITY_QUERY_KEY_ROOT = ["users", "activity"] as const;
export const USER_GROUPS_QUERY_KEY_ROOT = ["users", "groups"] as const;

export function useUserReviews(handle: string, page: number = 1) {
  return useQuery<UserReviewsResponse, BccApiError>({
    queryKey: [...USER_REVIEWS_QUERY_KEY_ROOT, handle, page],
    queryFn: ({ signal }) =>
      getUserReviews({ handle, page, perPage: DEFAULT_PER_PAGE }, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}

export function useUserDisputes(handle: string, page: number = 1) {
  return useQuery<UserDisputesResponse, BccApiError>({
    queryKey: [...USER_DISPUTES_QUERY_KEY_ROOT, handle, page],
    queryFn: ({ signal }) =>
      getUserDisputes({ handle, page, perPage: DEFAULT_PER_PAGE }, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}

export function useUserActivity(handle: string) {
  return useInfiniteQuery<
    FeedResponse,
    BccApiError,
    InfiniteData<FeedResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...USER_ACTIVITY_QUERY_KEY_ROOT, handle],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getUserActivity(handle, buildActivityParams(pageParam), signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled: handle !== "",
    staleTime: 30_000,
  });
}

function buildActivityParams(cursor: string | null): ActivityQueryParams {
  return {
    cursor,
    limit: ACTIVITY_PAGE_SIZE,
  };
}

/**
 * Lazy-load the §4.7.2 Profile Groups Tab list. No pagination — the
 * server returns the user's full membership in one shot. `staleTime`
 * matches the contract's `private, max-age=30` cache header so a
 * tab toggle within the window doesn't re-fetch.
 */
export function useUserGroups(handle: string) {
  return useQuery<UserGroupsResponse, BccApiError>({
    queryKey: [...USER_GROUPS_QUERY_KEY_ROOT, handle],
    queryFn: ({ signal }) => getUserGroups(handle, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}
