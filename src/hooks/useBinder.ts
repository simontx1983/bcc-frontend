"use client";

/**
 * useBinder — paginated read over GET /me/binder (§C2).
 *
 * The query key is namespaced as `["binder", params]` so:
 *   - the pull/unpull mutations can invalidate the whole namespace
 *     via `queryClient.invalidateQueries({ queryKey: ["binder"] })`,
 *     refetching ALL paginated views in one call;
 *   - separate components can subscribe to different page numbers
 *     without colliding on cache.
 *
 * 30-second staleTime aligns with our default (matches the server's
 * `Cache-Control: no-store` only weakly — the binder mutates via
 * pull/unpull, but invalidation is the trigger, not staleness).
 *
 * Use `BINDER_QUERY_KEY_ROOT` from any code that wants to invalidate
 * the namespace without depending on this hook directly.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getBinder,
  getBinderSummary,
  type BinderQueryParams,
} from "@/lib/api/binder-endpoints";
import type {
  BinderResponse,
  BinderSummaryResponse,
} from "@/lib/api/types";

/** Root key for ALL binder queries — invalidate this to refetch every paginated view. */
export const BINDER_QUERY_KEY_ROOT = ["binder"] as const;

export function useBinder(params: BinderQueryParams = {}) {
  return useQuery<BinderResponse>({
    queryKey: [...BINDER_QUERY_KEY_ROOT, params],
    queryFn: ({ signal }) => getBinder(params, signal),
    staleTime: 30_000,
  });
}

/**
 * useBinderSummary — §N9 identity-snapshot read. Lives under the
 * same `["binder"]` root so existing pull/unpull invalidations
 * (`queryClient.invalidateQueries({ queryKey: BINDER_QUERY_KEY_ROOT })`)
 * automatically refetch the summary alongside the paginated list.
 */
export function useBinderSummary() {
  return useQuery<BinderSummaryResponse>({
    queryKey: [...BINDER_QUERY_KEY_ROOT, "summary"],
    queryFn: ({ signal }) => getBinderSummary(signal),
    staleTime: 30_000,
  });
}
