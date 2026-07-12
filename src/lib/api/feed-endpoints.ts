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

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type { FeedItem, FeedResponse, FeedScope } from "@/lib/api/types";

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

/**
 * GET /feed/tag — posts carrying a given PeepSo hashtag. Same response
 * shape as /feed (FeedResponse + cursor pagination). The `tag` carries
 * no leading "#" — callers strip it before passing.
 */
export function getTagFeed(
  tag: string,
  params: FeedQueryParams = {},
  signal?: AbortSignal
): Promise<FeedResponse> {
  const search = paramSearch(params);
  search.set("tag", tag);
  const path = `feed/tag?${search.toString()}`;
  return bccFetchAsClient<FeedResponse>(path, { method: "GET", signal });
}

/**
 * GET /feed/:id — single-item permalink read. Anonymous-OK, backs the
 * `/post/[id]` detail page + its intercepting modal. Server-safe (uses
 * `bccFetch` directly) so `generateMetadata` and the SSR page body can
 * both call it during render — same pattern as `getCardEntity`.
 *
 * 404 contract: backend returns `bcc_not_found` (status 404) when the
 * id doesn't resolve OR isn't visible to this viewer. Callers branch on
 * the BccApiError status to delegate to Next's `notFound()`.
 */
export function getFeedItemById(
  id: string,
  token: string | null,
  signal?: AbortSignal
): Promise<FeedItem> {
  return bccFetch<FeedItem>(`feed/${encodeURIComponent(id)}`, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * Client twin of `getFeedItemById` — reads the session bearer itself via
 * `bccFetchAsClient`. Backs `useFeedItem`, which the `/post/[id]` page
 * seeds with SSR `initialData`; this refetch path only fires when that
 * cache entry goes stale in the browser (e.g. a background revalidate),
 * so the detail view stays a live, mutation-patchable cache entry rather
 * than a frozen server prop.
 */
export function getFeedItemByIdAsClient(
  id: string,
  signal?: AbortSignal
): Promise<FeedItem> {
  return bccFetchAsClient<FeedItem>(`feed/${encodeURIComponent(id)}`, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
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
