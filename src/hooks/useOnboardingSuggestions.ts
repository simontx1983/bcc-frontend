"use client";

/**
 * useOnboardingSuggestions — React Query hook over /onboarding/suggestions.
 *
 * 5-minute stale time matches the server's Cache-Control: private,
 * max-age=60 (we cache 5x longer client-side because the wizard
 * mounts once and the data is curated, not user-volatile). Refetch
 * on window focus is OFF — onboarding is a single-pass surface;
 * refreshing while the user is partway through would surprise them.
 *
 * F-439: the picked home chain is part of the key and goes out as
 * `?chain=`. `keepPreviousData` keeps the last chip's cards on screen
 * (with `isPlaceholderData` true) while the next chip's answer loads, so
 * a chip click never blanks the grid. A failed new chain has no data.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getOnboardingSuggestions } from "@/lib/api/onboarding-endpoints";
import type { HomeChain, OnboardingSuggestions } from "@/lib/api/types";

/** Key prefix — exported so a future "refresh" button can invalidate every chain. */
export const ONBOARDING_SUGGESTIONS_KEY = ["onboarding", "suggestions"] as const;

export function useOnboardingSuggestions(chain: HomeChain | null = null) {
  return useQuery<OnboardingSuggestions>({
    queryKey: [...ONBOARDING_SUGGESTIONS_KEY, chain],
    queryFn: ({ signal }) => getOnboardingSuggestions(chain, signal),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
