"use client";

/**
 * useGiphySearch — debounced Giphy search with trending fallback.
 *
 * When the picker mounts (empty query) → trending. When the user
 * types → debounced 300ms before firing the search query, so each
 * keystroke doesn't spam Giphy's API. Empty query after typing →
 * back to trending.
 *
 * Returns the standard React Query shape (`{data, isLoading,
 * error, ...}`); the picker handles loading + error states inline.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { giphySearch, giphyTrending } from "@/lib/api/giphy-client";
import type { GiphyIntegrationConfig, GiphySearchResult } from "@/lib/api/types";

const SEARCH_DEBOUNCE_MS = 300;

interface UseGiphySearchOptions {
  query: string;
  config: GiphyIntegrationConfig | undefined;
  /** When false, the hook idles — used to defer fetching until the picker is open. */
  enabled: boolean;
}

export function useGiphySearch({ query, config, enabled }: UseGiphySearchOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const isReady = enabled && config !== undefined && config.enabled && config.api_key !== "";
  const trimmed = debouncedQuery.trim();

  return useQuery<GiphySearchResult[], Error>({
    queryKey: ["giphy", "search", trimmed, config?.rating ?? "", config?.display_limit ?? 0],
    enabled: isReady,
    queryFn: ({ signal }) => {
      // The isReady guard above ensures `config` is defined here, but
      // narrowing across a closure boundary requires a defensive read.
      if (config === undefined || config.api_key === "") {
        return Promise.resolve([]);
      }
      const params = {
        apiKey: config.api_key,
        rating: config.rating,
        limit:  config.display_limit,
        signal,
      };
      return trimmed === ""
        ? giphyTrending(params)
        : giphySearch(trimmed, params);
    },
    staleTime: 30_000,
    retry: 1,
  });
}
