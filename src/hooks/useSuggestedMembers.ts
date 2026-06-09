"use client";

/**
 * useSuggestedMembers — the Suggested-members sidebar widget hook.
 *
 * Plain `useQuery` (not infinite) — the widget shows a fixed top-N, no
 * pagination. staleTime 5m: the recommender regenerates on a slow
 * cadence server-side, so a 5-minute window avoids refetch churn on
 * every navigation while staying fresh enough for a sidebar accent
 * (mirrors useTrendingHashtags).
 *
 * AUTH-GATED: GET /suggestions/users is personalized and returns 401
 * for anonymous viewers. The widget owns the auth check (via
 * useSession) and passes `enabled` so the query never fires for
 * signed-out users — no wasted 401 round-trip, no error frame.
 */

import { useQuery } from "@tanstack/react-query";

import { getSuggestedMembers } from "@/lib/api/suggestions-endpoints";
import type { SuggestedMembersResponse } from "@/lib/api/types";

export const SUGGESTED_MEMBERS_QUERY_KEY = ["suggestions", "users"] as const;

export interface UseSuggestedMembersOptions {
  /** Gate the query on the viewer's auth state — the widget passes this. */
  enabled?: boolean;
}

export function useSuggestedMembers({ enabled = true }: UseSuggestedMembersOptions = {}) {
  return useQuery<SuggestedMembersResponse>({
    queryKey: SUGGESTED_MEMBERS_QUERY_KEY,
    queryFn: ({ signal }) => getSuggestedMembers(5, signal),
    staleTime: 5 * 60_000,
    enabled,
  });
}
