"use client";

/**
 * useTrendingHashtags — the §F trending-hashtag sidebar widget hook.
 *
 * Plain `useQuery` (not infinite) — the widget shows a fixed top-N, no
 * pagination. staleTime 5m: trending counts regenerate on a slow cadence
 * server-side, so a 5-minute window avoids refetch churn on every
 * navigation while staying fresh enough for a sidebar accent.
 */

import { useQuery } from "@tanstack/react-query";

import { getTrendingHashtags } from "@/lib/api/hashtags-endpoints";
import type { TrendingHashtagsResponse } from "@/lib/api/types";

export const TRENDING_HASHTAGS_QUERY_KEY = ["hashtags", "trending"] as const;

export function useTrendingHashtags() {
  return useQuery<TrendingHashtagsResponse>({
    queryKey: TRENDING_HASHTAGS_QUERY_KEY,
    queryFn: ({ signal }) => getTrendingHashtags(8, signal),
    staleTime: 5 * 60_000,
  });
}
