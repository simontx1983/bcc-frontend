"use client";

/**
 * useWatching — paginated read over GET /me/watching (§C2).
 *
 * The query key is namespaced as `["watching", params]` so:
 *   - the watch/unwatch mutations can invalidate the whole namespace
 *     via `queryClient.invalidateQueries({ queryKey: ["watching"] })`,
 *     refetching ALL paginated views in one call;
 *   - separate components can subscribe to different page numbers
 *     without colliding on cache.
 *
 * 30-second staleTime aligns with our default (matches the server's
 * `Cache-Control: no-store` only weakly — the watchlist mutates via
 * watch/unwatch, but invalidation is the trigger, not staleness).
 *
 * Use `WATCHING_QUERY_KEY_ROOT` from any code that wants to invalidate
 * the namespace without depending on this hook directly.
 *
 * Renamed from `useBinder` 2026-05-13 per the §1.1.1 additive-deprecation
 * runway. Backend keeps `/me/binder` alive for one release with
 * `Deprecation`/`Sunset` headers; frontend talks to `/me/watching` only.
 */

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import {
  getWatching,
  getWatchingSummary,
  type WatchingQueryParams,
} from "@/lib/api/watching-endpoints";
import type {
  WatchingResponse,
  WatchingSummaryResponse,
} from "@/lib/api/types";

/** Root key for ALL watching queries — invalidate this to refetch every paginated view. */
export const WATCHING_QUERY_KEY_ROOT = ["watching"] as const;

export function useWatching(params: WatchingQueryParams = {}) {
  // Auth gate (same pattern as useBadges' provider): /me/watching is a
  // viewer-scoped endpoint that 401s for anonymous viewers, so the query
  // never fires without a session. Anon consumers see `data: undefined`
  // and keep their existing empty-state shape (`data?.items ?? []`), so
  // Pull buttons still render their signed-out affordance.
  const session = useSession();

  return useQuery<WatchingResponse>({
    queryKey: [...WATCHING_QUERY_KEY_ROOT, params],
    queryFn: ({ signal }) => getWatching(params, signal),
    staleTime: 30_000,
    enabled: session.status === "authenticated",
  });
}

/**
 * useWatchingSummary — §N9 identity-snapshot read. Lives under the
 * same `["watching"]` root so existing watch/unwatch invalidations
 * (`queryClient.invalidateQueries({ queryKey: WATCHING_QUERY_KEY_ROOT })`)
 * automatically refetch the summary alongside the paginated list.
 */
export function useWatchingSummary() {
  // Same anon gate as useWatching — see comment there.
  const session = useSession();

  return useQuery<WatchingSummaryResponse>({
    queryKey: [...WATCHING_QUERY_KEY_ROOT, "summary"],
    queryFn: ({ signal }) => getWatchingSummary(signal),
    staleTime: 30_000,
    enabled: session.status === "authenticated",
  });
}
