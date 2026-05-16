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

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  DirectoryKind,
  SearchSuggestionsResponse,
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
