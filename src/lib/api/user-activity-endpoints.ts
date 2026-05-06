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
  FeedResponse,
  UserDisputesResponse,
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
