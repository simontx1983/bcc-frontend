"use client";

/**
 * useUser — lazy, cached read of a member profile for the author card.
 *
 * The card renders instantly from the base identity fields the caller
 * already has (name/handle/avatar/rank), then enriches with bio + follow
 * counts from this fetch — the Twitter hover-card pattern. Gated by
 * `enabled` so the (heavy) full-profile fetch only fires when a card is
 * actually shown (hover open / sidebar mounted), and keyed by handle so
 * repeat hovers over the same author are served from cache.
 *
 * Instant re-hover (Twitter feel): `staleTime` keeps a fetched profile
 * "fresh" long enough that re-opening the card serves cache with no
 * refetch, and a generous `gcTime` keeps it in cache across the
 * open/close unmounts of the hover portal — so the skeleton shows only on
 * the first-ever load of an author, never on a re-hover. `usePrefetchUser`
 * warms the cache on pointer-intent (before the hover open delay elapses),
 * so even that first hover usually resolves before the card mounts.
 *
 * Perf note: `/users/:handle` returns the full profile view-model, which
 * is more than a card needs. If avatar-hover traffic ever makes that
 * payload a cost, the right fix is a lightweight `/users/:handle/card`
 * summary endpoint on bcc-trust — swap the queryFn, keep this signature.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getUserAsClient } from "@/lib/api/user-endpoints";
import type { BccApiError, MemberProfile } from "@/lib/api/types";

// Fresh for 5 min → a re-hover within a review session never refetches
// (no skeleton, no flash). Held in cache for 30 min after the last card
// closes → survives the hover portal's open/close unmount cycle.
const USER_STALE_TIME = 5 * 60_000;
const USER_GC_TIME = 30 * 60_000;

function userQueryOptions(handle: string) {
  return {
    queryKey: ["user", handle] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getUserAsClient(handle, signal),
    staleTime: USER_STALE_TIME,
    gcTime: USER_GC_TIME,
    // Fail fast. Legacy accounts whose byline handle isn't a resolvable
    // slug (e.g. a space-bearing "Tialuxe Tech") 404 here; the default 3
    // retries with backoff kept the card in its skeleton for ~7s and made
    // every re-hover feel like a fresh load. One request → cached error →
    // the card degrades to its no-counts state instead of looping. (The
    // real fix is backend — the feed should emit a canonical handle; see
    // the handle-resolution note.)
    retry: false,
  };
}

export function useUser(handle: string, opts?: { enabled?: boolean }) {
  return useQuery<MemberProfile, BccApiError>({
    ...userQueryOptions(handle),
    enabled: (opts?.enabled ?? true) && handle !== "",
  });
}

/**
 * Returns a stable `prefetch(handle)` that warms the same cache entry
 * `useUser` reads. Call it on pointer-enter of a hover trigger so the
 * profile is usually already loaded by the time the hover open delay
 * elapses and the card mounts. No-ops on empty handles and when the entry
 * is already fresh (React Query dedupes against `staleTime`).
 */
export function usePrefetchUser() {
  const queryClient = useQueryClient();
  return useCallback(
    (handle: string) => {
      if (handle === "") return;
      void queryClient.prefetchQuery(userQueryOptions(handle));
    },
    [queryClient],
  );
}
