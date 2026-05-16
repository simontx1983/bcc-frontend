/**
 * Typed wrappers for the lazy-loaded profile-tab endpoints.
 *
 * Reviews + Disputes use §V1.5 offset pagination (`page` + `perPage`);
 * Activity uses cursor pagination matching the Floor feed (§F3) — the
 * two shapes coexist here because they all hang off the same handle
 * route prefix, just with different paging semantics per surface.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AlbumPhotosResponse,
  FeedResponse,
  UserAlbumsResponse,
  UserDisputesResponse,
  UserEndorsementsResponse,
  UserFollowsResponse,
  UserGroupsResponse,
  UserReviewsResponse,
} from "@/lib/api/types";

interface ListParams {
  handle: string;
  page?: number;
  perPage?: number;
}

function buildQuery(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    search.set("per_page", String(params.perPage));
  }
  const qs = search.toString();
  return qs !== "" ? `?${qs}` : "";
}

export function getUserReviews(
  params: ListParams,
  signal?: AbortSignal,
): Promise<UserReviewsResponse> {
  const path =
    `users/${encodeURIComponent(params.handle)}/reviews${buildQuery(params)}`;
  return bccFetchAsClient<UserReviewsResponse>(path, { method: "GET", signal });
}

export function getUserDisputes(
  params: ListParams,
  signal?: AbortSignal,
): Promise<UserDisputesResponse> {
  const path =
    `users/${encodeURIComponent(params.handle)}/disputes${buildQuery(params)}`;
  return bccFetchAsClient<UserDisputesResponse>(path, { method: "GET", signal });
}

export interface ActivityQueryParams {
  /** Opaque cursor from the previous page's `pagination.next_cursor`. */
  cursor?: string | null;
  /** Items per page. Server caps at 50; default 20. */
  limit?: number;
}

/**
 * GET /users/:handle/activity — per-user wall (PeepSo "stream" filtered
 * to one author). Returns the same `FeedResponse` shape as `/feed/hot`
 * since this is a one-author slice of the same activity stream — the
 * frontend renders both through `<FeedItemCard>`.
 *
 * Cursor paginated — different from reviews/disputes which use offset.
 */
export function getUserActivity(
  handle: string,
  params: ActivityQueryParams = {},
  signal?: AbortSignal,
): Promise<FeedResponse> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path = `users/${encodeURIComponent(handle)}/activity${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<FeedResponse>(path, { method: "GET", signal });
}

/**
 * GET /users/:handle/groups — §4.7.2 Profile Groups Tab.
 *
 * Cross-kind list of all PeepSo groups the target user is an active
 * member of. Server filters secret groups for non-self viewers and
 * computes viewer-aware `permissions.can_join` / `can_leave` per row.
 * No pagination; entire list returned in one shot (cap is the user's
 * total membership count).
 *
 * Cache: `private, max-age=30` (per-viewer permissions).
 * Anonymous reads supported (server returns public + closed groups,
 * with all `can_leave.allowed = false`).
 */
export function getUserGroups(
  handle: string,
  signal?: AbortSignal,
): Promise<UserGroupsResponse> {
  const path = `users/${encodeURIComponent(handle)}/groups`;
  return bccFetchAsClient<UserGroupsResponse>(path, { method: "GET", signal });
}

/**
 * GET /users/:handle/endorsements — §J.6 given direction. Pages this
 * user has endorsed. Distinct from the attestation roster on §J.6 which
 * is the received direction. Anonymous-readable per §J doctrine.
 *
 * Server caps at 50 per response; no pagination in V1 (the typical
 * operator's endorsement count is small). Cache: `public, max-age=15`.
 */
export function getUserEndorsements(
  handle: string,
  limit: number = 20,
  signal?: AbortSignal,
): Promise<UserEndorsementsResponse> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  const path = `users/${encodeURIComponent(handle)}/endorsements?${search.toString()}`;
  return bccFetchAsClient<UserEndorsementsResponse>(path, { method: "GET", signal });
}

/**
 * GET /users/:handle/albums — §3.1 Photos tab → Albums sub-tab.
 *
 * Read-only list of the target user's PeepSo photo albums. Privacy
 * filter is server-side (mirrors PeepSo's get_user_photos_album access
 * grammar): anonymous viewers see only public; logged-in viewers see
 * public + members; friends additionally see friend-scoped; only the
 * owner sees their private albums.
 *
 * No pagination; the server caps the result set at the repository's
 * bounded query limit. Cache: `private, max-age=30`.
 */
export function getUserAlbums(
  handle: string,
  signal?: AbortSignal,
): Promise<UserAlbumsResponse> {
  const path = `users/${encodeURIComponent(handle)}/albums`;
  return bccFetchAsClient<UserAlbumsResponse>(path, { method: "GET", signal });
}

/**
 * GET /users/:handle/albums/:id/photos — drill-down list of every
 * photo in a single album.
 *
 * Server re-checks the album's `pho_album_acc` against the viewer so
 * a stale album_id from the list endpoint can't replay past a later
 * friend-state flip; 404 is returned for both "missing" and "no
 * access" to avoid leaking existence.
 *
 * No pagination; the server caps the result set at the repository's
 * bounded query. Cache: `private, max-age=30`.
 */
export function getAlbumPhotos(
  handle: string,
  albumId: number,
  signal?: AbortSignal,
): Promise<AlbumPhotosResponse> {
  const path = `users/${encodeURIComponent(handle)}/albums/${albumId}/photos`;
  return bccFetchAsClient<AlbumPhotosResponse>(path, { method: "GET", signal });
}

export interface FollowsListParams {
  handle: string;
  offset?: number;
  limit?: number;
}

function buildOffsetQuery(params: FollowsListParams): string {
  const search = new URLSearchParams();
  if (params.offset !== undefined) {
    search.set("offset", String(params.offset));
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  return qs !== "" ? `?${qs}` : "";
}

/**
 * GET /users/:handle/followers — §3.1 Watching tab "Being Watched"
 * sub-tab. Paginated list of users following the target.
 *
 * 403 `bcc_permission_denied` when the target has watching_hidden set
 * and the viewer is not the owner. Cache: `private, max-age=30`.
 */
export function getUserFollowers(
  params: FollowsListParams,
  signal?: AbortSignal,
): Promise<UserFollowsResponse> {
  const path =
    `users/${encodeURIComponent(params.handle)}/followers${buildOffsetQuery(params)}`;
  return bccFetchAsClient<UserFollowsResponse>(path, { method: "GET", signal });
}

/**
 * GET /users/:handle/following — §3.1 Watching tab "Keeping Tabs"
 * sub-tab. Paginated list of users the target follows. Same privacy
 * gate as /followers.
 */
export function getUserFollowing(
  params: FollowsListParams,
  signal?: AbortSignal,
): Promise<UserFollowsResponse> {
  const path =
    `users/${encodeURIComponent(params.handle)}/following${buildOffsetQuery(params)}`;
  return bccFetchAsClient<UserFollowsResponse>(path, { method: "GET", signal });
}
