"use client";

/**
 * useDirectory — paginated cards-list query for the §G1/§G2 directory.
 *
 * Built on TanStack `useInfiniteQuery` so a "Load more" button is a
 * single `fetchNextPage()` call and pages stay coherent across
 * filter changes (the query key includes the filter signature, so
 * changing a filter invalidates the cache for that filter set
 * automatically without leaking pages from the prior shape).
 *
 * Pagination model:
 *   - Page-based (1-based), matches the cards-list endpoint contract.
 *   - `getNextPageParam` returns the next page number when `has_more`
 *     is true, or `undefined` when exhausted.
 *
 * Stale time: 60s — directory data changes slowly (trust scores
 * recompute every 5 min server-side; new validators / creators land
 * over hours, not seconds). Longer stale time means smoother
 * filter-toggle UX without spurious refetches.
 *
 * Anon-OK: the cards-list endpoint does not require auth, so the hook
 * fires for both signed-in and anonymous viewers. Per-viewer
 * `permissions` on each Card vary by session.
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { getCardsList } from "@/lib/api/cards-list-endpoints";
import type {
  BccApiError,
  CardsListQueryParams,
  CardsListResponse,
  DirectoryKind,
  DirectorySort,
  DirectoryTier,
} from "@/lib/api/types";

const PAGE_SIZE = 24;

/** Filter signature consumed by the hook — matches the URL param surface. */
export interface DirectoryFilters {
  kind: DirectoryKind | null;
  tier: DirectoryTier | null;
  sort: DirectorySort;
  q: string;
  /**
   * §G2 — when true, the server restricts results to tier ≥ neutral
   * (good standing). Composes with `tier` via AND server-side.
   */
  goodStandingOnly: boolean;
  /**
   * Chain slug filter — null when no chain is selected. Server-side
   * the chain JOIN only fires for validator-backed pages, so this is
   * effective today only when `kind === 'validator'`. The page-level
   * filter UI hides the chain pill outside that kind so a user can't
   * accidentally select a chain that would just zero out their results.
   */
  chain: string | null;
}

export const DIRECTORY_QUERY_KEY_ROOT = ["directory"] as const;

/**
 * Build a stable cache key for the current filter set. The hook key
 * includes the filter signature so different filter combos cache
 * independently and React Query doesn't bleed pages across changes.
 */
function buildQueryKey(filters: DirectoryFilters): QueryKey {
  return [
    ...DIRECTORY_QUERY_KEY_ROOT,
    filters.kind ?? "all",
    filters.tier ?? "all",
    filters.sort,
    filters.q,
    filters.goodStandingOnly ? "gs" : "any",
    filters.chain ?? "any-chain",
  ] as const;
}

export function useDirectory(filters: DirectoryFilters) {
  return useInfiniteQuery<
    CardsListResponse,
    BccApiError,
    InfiniteData<CardsListResponse>,
    QueryKey,
    number
  >({
    queryKey: buildQueryKey(filters),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getCardsList(buildParams(filters, pageParam), signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: 60_000,
  });
}

function buildParams(filters: DirectoryFilters, page: number): CardsListQueryParams {
  const params: CardsListQueryParams = {
    sort: filters.sort,
    page,
    per_page: PAGE_SIZE,
  };
  if (filters.kind !== null) {
    params.kind = filters.kind;
  }
  if (filters.tier !== null) {
    params.tier = filters.tier;
  }
  if (filters.q !== "") {
    params.q = filters.q;
  }
  if (filters.goodStandingOnly) {
    params.good_standing_only = true;
  }
  if (filters.chain !== null && filters.chain !== "") {
    params.chain = filters.chain;
  }
  return params;
}
