"use client";

/**
 * useTrendingSearches — top-scored projects regardless of query.
 *
 * Surfaces in two places:
 *   - GlobalSearch dropdown pre-search state (empty input, focused).
 *   - /search page landing state when no `?q=` is set.
 *
 * No debounce — fires immediately when `enabled`. Stale time = 5 min to
 * match bcc-search's server-side cache (SearchController::handle_trending
 * caches for 300s); refetching sooner just rotates within the same LKG
 * window. React Query's `enabled` is the caller's gate (e.g. only fire
 * when the dropdown is actually visible).
 */

import { useQuery } from "@tanstack/react-query";

import { getTrendingSearches } from "@/lib/api/cards-search-endpoints";
import type { TrendingResponse } from "@/lib/api/types";

interface UseTrendingSearchesOptions {
  enabled?: boolean;
}

export function useTrendingSearches(options: UseTrendingSearchesOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery<TrendingResponse>({
    queryKey: ["search", "trending"],
    queryFn: ({ signal }) => getTrendingSearches(signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}
