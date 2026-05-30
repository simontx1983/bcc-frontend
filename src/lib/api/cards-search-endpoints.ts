/**
 * Typed wrapper for GET /bcc/v1/cards/search (§G1 nav autocomplete).
 *
 * Anonymous-OK — search is open to everyone, even before signup.
 * The endpoint mirrors bcc-search's quality gate (min 2 chars,
 * stopwords dropped) so a too-short query gets a fast empty
 * response instead of a 400.
 *
 * Uses `bccFetchAsClient` so signed-in viewers get their Bearer
 * token attached automatically (the hook caller in
 * `useGlobalSearch.ts` runs in a client component). Without this,
 * signed-in users would see search results as if anonymous —
 * viewer-aware ranking signals on the server would silently degrade.
 */

import {
  bccFetchAsClient,
  bccSearchFetchAsClient,
} from "@/lib/api/client";
import type {
  DirectoryKind,
  GroupSearchResponse,
  ProjectSearchResponse,
  SearchSuggestionsResponse,
  TrendingResponse,
  UserSearchResponse,
} from "@/lib/api/types";

export interface SearchSuggestionsParams {
  q: string;
  kind?: DirectoryKind;
}

export function getSearchSuggestions(
  params: SearchSuggestionsParams,
  signal?: AbortSignal
): Promise<SearchSuggestionsResponse> {
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.kind !== undefined) {
    search.set("kind", params.kind);
  }
  return bccFetchAsClient<SearchSuggestionsResponse>(
    `cards/search?${search.toString()}`,
    {
      method: "GET",
      ...(signal !== undefined ? { signal } : {}),
    }
  );
}

// ─────────────────────────────────────────────────────────────────────
// Multi-vertical search (bcc-search direct — raw response shape).
//
// These talk to bcc-search endpoints that predate the §L5 envelope, so
// they go through `bccSearchFetchAsClient` (NOT the envelope-strict
// bccFetch path). The trade-off is documented in client.ts: bcc-search
// is contract-stable but returns `{ results, meta }` instead of
// `{ data, _meta }`. The /search results page and the GlobalSearch
// dropdown's pre-search trending surface consume these.
// ─────────────────────────────────────────────────────────────────────

export interface SearchProjectsParams {
  q: string;
  /** Filter by reputation category slug (e.g. "validator"). Optional. */
  type?: string;
}

export function getSearchProjects(
  params: SearchProjectsParams,
  signal?: AbortSignal
): Promise<ProjectSearchResponse> {
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.type !== undefined && params.type !== "") {
    search.set("type", params.type);
  }
  return bccSearchFetchAsClient<ProjectSearchResponse>(
    `search?${search.toString()}`,
    signal !== undefined ? { signal } : {}
  );
}

export interface SearchUsersParams {
  q: string;
  /** Result cap. Server caps at 50; default 20. */
  limit?: number;
}

export function getSearchUsers(
  params: SearchUsersParams,
  signal?: AbortSignal
): Promise<UserSearchResponse> {
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  return bccSearchFetchAsClient<UserSearchResponse>(
    `search/users?${search.toString()}`,
    signal !== undefined ? { signal } : {}
  );
}

export interface SearchGroupsParams {
  q: string;
  limit?: number;
}

export function getSearchGroups(
  params: SearchGroupsParams,
  signal?: AbortSignal
): Promise<GroupSearchResponse> {
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  return bccSearchFetchAsClient<GroupSearchResponse>(
    `search/groups?${search.toString()}`,
    signal !== undefined ? { signal } : {}
  );
}

/**
 * Top-scored projects regardless of query. 5-minute server cache + LKG
 * fallback. Used by the search dropdown's pre-search surface and the
 * /search page's query-less landing state.
 */
export function getTrendingSearches(
  signal?: AbortSignal
): Promise<TrendingResponse> {
  return bccSearchFetchAsClient<TrendingResponse>(
    "search?trending=1",
    signal !== undefined ? { signal } : {}
  );
}
