"use client";

/**
 * useBlogChainOptions — React Query wrapper around
 * `getBlogChainOptions()` (§D6 PR-B endpoint).
 *
 * Picker source for the composer's chain-tag multi-select. The
 * backend caches at the HTTP layer (`Cache-Control: public,
 * max-age=3600`) so this hook keeps `staleTime` matched to that
 * window — the browser cache satisfies repeat reads inside the
 * hour without round-tripping the server.
 *
 * `gcTime` extends to 24h so a user closing + reopening the
 * composer within a day reuses the in-memory result instantly.
 */

import { useQuery } from "@tanstack/react-query";

import { getBlogChainOptions } from "@/lib/api/blog-endpoints";
import type { BlogChainOptionsResponse } from "@/lib/api/types";

export const BLOG_CHAIN_OPTIONS_KEY = ["blog-chain-options"] as const;

export function useBlogChainOptions() {
  return useQuery<BlogChainOptionsResponse>({
    queryKey: BLOG_CHAIN_OPTIONS_KEY,
    queryFn: ({ signal }) => getBlogChainOptions(signal),
    staleTime: 60 * 60 * 1000, // 1h — matches Cache-Control max-age
    gcTime:    24 * 60 * 60 * 1000, // 24h
  });
}