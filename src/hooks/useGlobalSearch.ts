"use client";

/**
 * useGlobalSearch — debounced suggestions query for the §G1 nav
 * autocomplete.
 *
 * Behaviour:
 *   - Caller passes the raw input string. The shared useSearchTerm
 *     debounces it (~200ms) before firing the network request.
 *   - Queries with under 2 chars return an empty list locally — no
 *     wasted round-trip. The server enforces the same rule so this
 *     gate is a courtesy, not a contract.
 *   - The query key includes the debounced query so React Query
 *     caches per query string. Typing the same word again hits cache.
 *   - `enabled: false` holds the request without resetting the term.
 *     GlobalSearch passes its dropdown's open state: the box can now
 *     hold a term while closed (synced from /search?q=), and a closed,
 *     possibly hidden (mobile) box must not fetch suggestions.
 *
 * Stale time is short (15s): a search for "cosmos" five minutes
 * apart should re-rank against current trust scores.
 *
 * Anon-OK at the API layer — no auth gating in the hook.
 */

import { useQuery } from "@tanstack/react-query";

import { useSearchTerm } from "@/hooks/useSearchTerm";
import { getSearchSuggestions } from "@/lib/api/cards-search-endpoints";
import type {
  SearchSuggestionsResponse,
  SuggestionKind,
} from "@/lib/api/types";

export function useGlobalSearch(
  rawQuery: string,
  kind?: SuggestionKind,
  options: { enabled?: boolean } = {},
) {
  // Debounced mirror of the input. Drives the React Query key, so the
  // network only fires after typing settles.
  const term = useSearchTerm(rawQuery);

  return useQuery<SearchSuggestionsResponse>({
    // Scope is part of the cache key: "cosmos" under Members and
    // "cosmos" under All are different result sets.
    queryKey: ["search", "suggestions", term, kind ?? "all"],
    queryFn: ({ signal }) =>
      getSearchSuggestions(
        kind === undefined ? { q: term } : { q: term, kind },
        signal,
      ),
    enabled: term !== "" && options.enabled !== false,
    staleTime: 15_000,
    // Keep showing the prior list while a new query is in flight — the
    // dropdown shouldn't blank out on every keystroke — but ONLY within
    // the same scope. Carrying rows across a scope switch briefly
    // rendered wrong-scope suggestions (with a live highlight a fast
    // Enter could activate) for one round-trip.
    placeholderData: (
      prev: SearchSuggestionsResponse | undefined,
      prevQuery: { queryKey: readonly unknown[] } | undefined,
    ) =>
      prevQuery !== undefined && prevQuery.queryKey[3] === (kind ?? "all")
        ? prev
        : undefined,
  });
}
