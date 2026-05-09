/**
 * Typed wrappers for the §4.7.5 / §4.7.6 / §4.7.7 group-detail endpoints.
 *
 *   - GET /bcc/v1/groups/{slug}             → GroupDetailResponse
 *   - GET /bcc/v1/groups/{id}/feed          → FeedResponse  (cursor-paginated)
 *   - GET /bcc/v1/groups/{id}/members       → GroupMembersResponse (offset)
 *
 * All three are server-safe (use `bccFetch` directly with an explicit
 * token) so the `/groups/[slug]` server component can fetch during SSR.
 * The companion React Query hooks call them through the same wrappers
 * so the wire path matches in dev tools.
 *
 * Privacy errors land as typed `BccApiError`:
 *   - 404 `bcc_not_found`        — missing slug OR secret + non-member
 *                                  (server never distinguishes these on
 *                                   the wire — caller maps to `notFound()`)
 *   - 403 `bcc_permission_denied` — group exists but viewer lacks read
 *                                   permission; `err.message` is the
 *                                   server-pinned `unlock_hint`
 *
 * Cache convention is owned server-side; we don't add cache headers
 * here.
 */

import { bccFetch } from "@/lib/api/client";
import type {
  FeedResponse,
  GroupDetailResponse,
  GroupMembersResponse,
} from "@/lib/api/types";

/**
 * GET /groups/{slug} — single-group detail view-model.
 *
 * Server-safe. 404 surfaces as a typed `BccApiError` with status 404 —
 * callers map to Next's `notFound()`.
 */
export function getGroup(
  slug: string,
  token: string | null,
  signal?: AbortSignal
): Promise<GroupDetailResponse> {
  return bccFetch<GroupDetailResponse>(
    `groups/${encodeURIComponent(slug)}`,
    {
      method: "GET",
      token,
      ...(signal !== undefined ? { signal } : {}),
    }
  );
}

/**
 * GET /groups/{id}/feed — group-scoped feed, cursor-paginated.
 *
 * Same envelope as `GET /feed` — `{items, pagination: {next_cursor,
 * has_more}}`. Server returns 403 `bcc_permission_denied` for
 * non-members of NFT/closed groups; the unlock_hint comes back as
 * `err.message` and should be rendered verbatim (§A4 / §N7).
 *
 * The detail-page renderer should NOT call this when
 * `group.feed_visible === false` — gate at that boundary instead so
 * the 403 never hits the wire.
 */
export function getGroupFeed(
  groupId: number,
  cursor: string | null,
  limit: number,
  token: string | null,
  signal?: AbortSignal
): Promise<FeedResponse> {
  const search = new URLSearchParams();
  if (cursor !== null && cursor !== "") {
    search.set("cursor", cursor);
  }
  if (limit > 0) {
    search.set("limit", String(limit));
  }
  const qs = search.toString();
  const path = qs === ""
    ? `groups/${groupId}/feed`
    : `groups/${groupId}/feed?${qs}`;

  return bccFetch<FeedResponse>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * GET /groups/{id}/members — paginated roster.
 *
 * Offset-based pagination (per §4.7.7); roster is stable-ordered by
 * (role_rank, joined_at DESC). Server caps `limit` at 100; defaults to
 * 24 when unset.
 *
 * Privacy error envelope mirrors `getGroupFeed`: 403 with the server's
 * "Join the group to see its roster." copy when a non-member queries a
 * closed roster. The detail-page renderer should NOT call this when
 * `group.members_visible === false`.
 */
export function getGroupMembers(
  groupId: number,
  offset: number,
  limit: number,
  token: string | null,
  signal?: AbortSignal
): Promise<GroupMembersResponse> {
  const search = new URLSearchParams();
  if (offset > 0) {
    search.set("offset", String(offset));
  }
  if (limit > 0) {
    search.set("limit", String(limit));
  }
  const qs = search.toString();
  const path = qs === ""
    ? `groups/${groupId}/members`
    : `groups/${groupId}/members?${qs}`;

  return bccFetch<GroupMembersResponse>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
