"use client";

/**
 * useGroup — client-side fetch of `GET /bcc/v1/groups/{slug}`.
 *
 * The `/groups/[slug]` server component fetches via `getGroup()` for
 * SSR; this hook is the client-side equivalent for surfaces that need
 * live data (e.g. modals, preview drawers). The detail page itself
 * uses `router.refresh()` after a join/leave mutation — the simpler
 * pattern that mirrors `/locals/[slug]` + `LocalMembershipControls`.
 *
 * Stale time: 30s — matches the server's `Cache-Control` posture for
 * the authed branch (`private, no-store` would force every navigation
 * to re-fetch; this 30s window collapses tab/back-nav flicker without
 * staling membership state past one mutation).
 */

import { useQuery } from "@tanstack/react-query";

import { bccFetchAsClient } from "@/lib/api/client";
import type { BccApiError, GroupDetailResponse } from "@/lib/api/types";

/** Root key — exported so mutation hooks can invalidate the namespace. */
export const GROUP_DETAIL_QUERY_KEY_ROOT = ["groups", "detail"] as const;

export function useGroup(slug: string) {
  return useQuery<GroupDetailResponse, BccApiError>({
    queryKey: [...GROUP_DETAIL_QUERY_KEY_ROOT, slug],
    queryFn: ({ signal }) =>
      bccFetchAsClient<GroupDetailResponse>(
        `groups/${encodeURIComponent(slug)}`,
        { method: "GET", signal }
      ),
    enabled: slug !== "",
    staleTime: 30_000,
  });
}
