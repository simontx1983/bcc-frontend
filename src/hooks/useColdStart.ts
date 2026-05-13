"use client";

/**
 * useColdStart — §F5 / Sprint 3 cold-start bridge surface query.
 *
 * Posture rules (mirrored from FeedColdStartService.php's
 * constitutional comment block — do NOT relax these client-side):
 *
 *   - This hook backs DiscoverPanel, which mounts ONLY when the feed
 *     is empty. It is not a "default feed for inactive users." Do
 *     not extend the surface to mount on every page load, to refetch
 *     aggressively, or to pre-warm on tab focus.
 *
 *   - 60s stale time matches HighlightStrip — the cold-start blocks
 *     are slow-moving (locals + recent operators + hot bucket) and a
 *     viewer flipping between tabs shouldn't hammer the endpoint.
 *
 *   - refetchOnWindowFocus is DISABLED. The surface is supposed to
 *     feel quiet. Refetching when the user re-focuses the tab would
 *     re-shuffle the visible operators (the seed rotates daily, but
 *     the viewer's perception of "the same panel" should be stable
 *     within a session). The 60s stale time + explicit invalidate
 *     paths cover the cases where a refresh genuinely matters.
 *
 *   - Telemetry: per the service-side rule block, do NOT add
 *     click-through, time-spent, A/B, or per-block performance
 *     instrumentation here. Operational health (latency / error)
 *     belongs in the bccFetchAsClient transport layer, not this hook.
 */

import { useQuery } from "@tanstack/react-query";

import { getColdStart } from "@/lib/api/cold-start-endpoints";
import type { ColdStartResponse } from "@/lib/api/types";

export const COLD_START_QUERY_KEY = ["feed", "cold-start"] as const;

interface UseColdStartOptions {
  /**
   * Parent gates mounting on `items.length === 0`. The hook itself
   * accepts `enabled` for that gating so a noisy parent doesn't
   * fetch during the normal feed render.
   */
  enabled: boolean;
}

export function useColdStart({ enabled }: UseColdStartOptions) {
  return useQuery<ColdStartResponse>({
    queryKey: COLD_START_QUERY_KEY,
    queryFn: ({ signal }) => getColdStart(signal),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
