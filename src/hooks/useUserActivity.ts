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
  getAlbumPhotos,
  getUserActivity,
  getUserAlbums,
  getUserDisputes,
  getUserEndorsements,
  getUserFollowers,
  getUserFollowing,
  getUserGroups,
  getUserReviews,
  type ActivityQueryParams,
} from "@/lib/api/user-activity-endpoints";
import type {
  AlbumPhotosResponse,
  BccApiError,
  FeedResponse,
  UserAlbumsResponse,
  UserDisputesResponse,
  UserEndorsementsResponse,
  UserFollowsResponse,
  UserGroupsResponse,
  UserReviewsResponse,
} from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;
const ACTIVITY_PAGE_SIZE = 20;

export const USER_REVIEWS_QUERY_KEY_ROOT = ["users", "reviews"] as const;
export const USER_DISPUTES_QUERY_KEY_ROOT = ["users", "disputes"] as const;
export const USER_ACTIVITY_QUERY_KEY_ROOT = ["users", "activity"] as const;
export const USER_GROUPS_QUERY_KEY_ROOT = ["users", "groups"] as const;
export const USER_ALBUMS_QUERY_KEY_ROOT = ["users", "albums"] as const;
export const ALBUM_PHOTOS_QUERY_KEY_ROOT = ["users", "album-photos"] as const;
export const USER_FOLLOWERS_QUERY_KEY_ROOT = ["users", "followers"] as const;
export const USER_FOLLOWING_QUERY_KEY_ROOT = ["users", "following"] as const;
export const USER_ENDORSEMENTS_QUERY_KEY_ROOT = ["users", "endorsements"] as const;

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

/**
 * Lazy-load the §J.6 "given" direction — pages this user has
 * endorsed. Mounts inside the Backing tab's "Given" sub-tab (the
 * AttestationRoster occupies "Received"). No pagination — server caps
 * at 50 per response; the typical operator's endorsement count is small.
 * `staleTime` matches the contract's `public, max-age=15` header.
 */
export function useUserEndorsements(handle: string, limit: number = 20) {
  return useQuery<UserEndorsementsResponse, BccApiError>({
    queryKey: [...USER_ENDORSEMENTS_QUERY_KEY_ROOT, handle, limit],
    queryFn: ({ signal }) => getUserEndorsements(handle, limit, signal),
    enabled: handle !== "",
    staleTime: 15_000,
  });
}

/**
 * Lazy-load the §3.1 Photos tab → Albums sub-tab list. No pagination —
 * the server returns up to the repository's bounded cap in one shot.
 * `staleTime` matches the contract's `private, max-age=30` cache header
 * so flipping back into the sub-tab inside the window doesn't re-fetch.
 */
export function useUserAlbums(handle: string) {
  return useQuery<UserAlbumsResponse, BccApiError>({
    queryKey: [...USER_ALBUMS_QUERY_KEY_ROOT, handle],
    queryFn: ({ signal }) => getUserAlbums(handle, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}

/**
 * Lazy-load the photos inside a single album (the §3.1 drill-down).
 * `albumId === null` keeps the query disabled so we don't fire on
 * mount — the caller flips this on once the user picks a tile, off
 * when they return to the albums grid.
 */
export function useAlbumPhotos(handle: string, albumId: number | null) {
  return useQuery<AlbumPhotosResponse, BccApiError>({
    queryKey: [...ALBUM_PHOTOS_QUERY_KEY_ROOT, handle, albumId ?? 0],
    queryFn: ({ signal }) => getAlbumPhotos(handle, albumId ?? 0, signal),
    enabled: handle !== "" && albumId !== null && albumId > 0,
    staleTime: 30_000,
  });
}

const FOLLOWS_DEFAULT_LIMIT = 24;

/**
 * Lazy-load the §3.1 Watching tab "Being Watched" sub-tab — users
 * who follow `handle`. Single page; UI loads more by re-querying
 * with a higher offset.
 *
 * 403 surfaces as a `bcc_permission_denied` BccApiError so the
 * panel can render the "watching is private" empty-state instead
 * of a generic failure.
 */
export function useUserFollowers(handle: string, offset: number = 0) {
  return useQuery<UserFollowsResponse, BccApiError>({
    queryKey: [...USER_FOLLOWERS_QUERY_KEY_ROOT, handle, offset],
    queryFn: ({ signal }) =>
      getUserFollowers({ handle, offset, limit: FOLLOWS_DEFAULT_LIMIT }, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}

/**
 * Lazy-load the §3.1 Watching tab "Keeping Tabs" sub-tab — users
 * `handle` follows. Same shape + privacy gate as useUserFollowers.
 */
export function useUserFollowing(handle: string, offset: number = 0) {
  return useQuery<UserFollowsResponse, BccApiError>({
    queryKey: [...USER_FOLLOWING_QUERY_KEY_ROOT, handle, offset],
    queryFn: ({ signal }) =>
      getUserFollowing({ handle, offset, limit: FOLLOWS_DEFAULT_LIMIT }, signal),
    enabled: handle !== "",
    staleTime: 30_000,
  });
}
