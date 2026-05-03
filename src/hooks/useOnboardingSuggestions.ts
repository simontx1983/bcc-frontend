"use client";

/**
 * useOnboardingSuggestions — React Query hook over /onboarding/suggestions.
 *
 * 5-minute stale time matches the server's Cache-Control: private,
 * max-age=60 (we cache 5x longer client-side because the wizard
 * mounts once and the data is curated, not user-volatile). Refetch
 * on window focus is OFF — onboarding is a single-pass surface;
 * refreshing while the user is partway through would surprise them.
 */

import { useQuery } from "@tanstack/react-query";
import { getOnboardingSuggestions } from "@/lib/api/onboarding-endpoints";
import type { OnboardingSuggestions } from "@/lib/api/types";

/** Stable cache key — exported so a future "refresh" button can invalidate. */
export const ONBOARDING_SUGGESTIONS_KEY = ["onboarding", "suggestions"] as const;

export function useOnboardingSuggestions() {
  return useQuery<OnboardingSuggestions>({
    queryKey: ONBOARDING_SUGGESTIONS_KEY,
    queryFn: ({ signal }) => getOnboardingSuggestions(signal),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
