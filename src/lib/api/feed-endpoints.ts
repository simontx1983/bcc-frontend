/**
 * Typed wrappers for /feed and /feed/hot.
 *
 * Both wrappers go through `bccFetchAsClient` — the feed is the
 * Floor's main client-rendered surface (infinite-scroll, mutation
 * targets) so server-side prefetching isn't a contract requirement
 * yet. When SSR-hydration lands, add a `bccFetch`-based variant.
 *
 * Cursor pagination per §F3: each response carries
 * `pagination: { next_cursor, has_more }` and the next request
 * passes the same cursor back as the `cursor` query param.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { FeedResponse, FeedScope } from "@/lib/api/types";

export interface FeedQueryParams {
  /** Opaque cursor from the previous page's `pagination.next_cursor`. */
  cursor?: string | null;
  /** Items per page. Server caps at 50; default 20. */
  limit?: number;
}

/**
 * GET /feed/hot — the §F2 zero-follow trending feed. Anonymous-OK.
 * Used as the home-page default for unauthenticated visitors and as
 * the implicit fallback for logged-in users with no follows.
 */
export function getHotFeed(
  params: FeedQueryParams = {},
  signal?: AbortSignal
): Promise<FeedResponse> {
  const path = `feed/hot${buildQueryString(params)}`;
  return bccFetchAsClient<FeedResponse>(path, { method: "GET", signal });
}

/**
 * GET /feed — auth-required personalized feed across the three §N6
 * scopes (for_you / following / signals). Server applies the §F1
 * ranking based on the viewer's follow graph + reputation.
 */
export function getFeed(
  scope: FeedScope,
  params: FeedQueryParams = {},
  signal?: AbortSignal
): Promise<FeedResponse> {
  const search = paramSearch(params);
  search.set("scope", scope);
  const path = `feed?${search.toString()}`;
  return bccFetchAsClient<FeedResponse>(path, { method: "GET", signal });
}

// ─────────────────────────────────────────────────────────────────────

function paramSearch(params: FeedQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  return search;
}

function buildQueryString(params: FeedQueryParams): string {
  const search = paramSearch(params);
  const qs = search.toString();
  return qs === "" ? "" : `?${qs}`;
}
