/**
 * Typed wrapper for GET /bcc/v1/cards/search (§G1 nav autocomplete).
 *
 * Anonymous-OK — search is open to everyone, even before signup.
 * The endpoint mirrors bcc-search's quality gate (min 2 chars,
 * stopwords dropped) so a too-short query gets a fast empty
 * response instead of a 400.
 */

import { bccFetch } from "@/lib/api/client";
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
  return bccFetch<SearchSuggestionsResponse>(
    `cards/search?${search.toString()}`,
    {
      method: "GET",
      ...(signal !== undefined ? { signal } : {}),
    }
  );
}
