"use client";

/**
 * useGlobalSearch — debounced suggestions query for the §G1 nav
 * autocomplete.
 *
 * Behaviour:
 *   - Caller passes the raw input string. The hook debounces it
 *     (~200ms) before firing the network request.
 *   - Queries with under 2 chars return an empty list locally — no
 *     wasted round-trip. The server enforces the same rule so this
 *     gate is a courtesy, not a contract.
 *   - The query key includes the debounced query so React Query
 *     caches per query string. Typing the same word again hits cache.
 *
 * Stale time is short (15s): a search for "cosmos" five minutes
 * apart should re-rank against current trust scores.
 *
 * Anon-OK at the API layer — no auth gating in the hook.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getSearchSuggestions } from "@/lib/api/cards-search-endpoints";
import type { SearchSuggestionsResponse } from "@/lib/api/types";

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

export function useGlobalSearch(rawQuery: string) {
  // Debounced mirror of the input. Drives the React Query key, so the
  // network only fires after typing settles.
  const [debounced, setDebounced] = useState<string>("");

  useEffect(() => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < MIN_LENGTH) {
      setDebounced("");
      return;
    }
    const t = window.setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [rawQuery]);

  return useQuery<SearchSuggestionsResponse>({
    queryKey: ["search", "suggestions", debounced],
    queryFn: ({ signal }) => getSearchSuggestions({ q: debounced }, signal),
    enabled: debounced.length >= MIN_LENGTH,
    staleTime: 15_000,
    // Keep showing the prior list while a new query is in flight —
    // the dropdown shouldn't blank out on every keystroke.
    placeholderData: keepPreviousData,
  });
}
