"use client";

/**
 * useCardReviews / useCardWatchers — pagination hooks for the §Phase 2
 * entity-profile tab strip.
 *
 * Both are `useInfiniteQuery`, matching the eight other paginated surfaces in
 * this app (useFeed, useDirectory, useGroupMembers, useCreatorGallery,
 * useComments, …). They previously returned ONE page and left each panel to
 * accumulate rows in local state, which is what produced the defect this
 * replaces: `CardWatchersPanel` set parent state from inside its child's
 * render and React warned "Cannot update a component while rendering a
 * different component". TanStack owns the page list now, so there is no
 * accumulator to mis-sequence.
 *
 * Three properties the old accumulators hand-rolled, now structural:
 *
 *   - **Ordering** — pages are appended in fetch order by TanStack; nothing
 *     re-sorts them.
 *   - **Deduplication** — one query key holds the page list, and a given page
 *     param is fetched once. The old `seenPage` / `seenOffset` guards existed
 *     to stop a re-render appending the same page twice; that failure mode no
 *     longer exists.
 *   - **A failed request must not advance the cursor** — `fetchNextPage()`
 *     appends only on success. A failure leaves `data.pages` untouched, so the
 *     next retry asks for the SAME page param. No gap, no duplicate.
 *
 * staleTime 30_000 matches each endpoint's `private, max-age=30` cache header
 * so a tab toggle inside the window doesn't re-fetch.
 *
 * The two exported key ROOTS are unchanged and still prefix the real keys, so
 * the invalidations in Composer and ReviewCallout keep matching.
 *
 * (useCardDisputes was retired 2026-07-08 with the entity Disputes tab — the
 * entity's active-dispute context now lives in the §J negative-signals
 * summary.)
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import {
  getCardReviews,
  getCardWatchers,
} from "@/lib/api/card-tabs-endpoints";
import type {
  BccApiError,
  CardReviewsResponse,
  CardWatchersResponse,
  EntityCardKind,
  ReviewTargetKind,
} from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;
const DEFAULT_LIMIT    = 24;

export const CARD_REVIEWS_QUERY_KEY_ROOT  = ["entities", "reviews"]  as const;
export const CARD_WATCHERS_QUERY_KEY_ROOT = ["entities", "watchers"] as const;

/**
 * Reviews are page-numbered (`page` / `total_pages`), like useCreatorGallery.
 */
export function useCardReviews(kind: ReviewTargetKind, id: number) {
  return useInfiniteQuery<
    CardReviewsResponse,
    BccApiError,
    InfiniteData<CardReviewsResponse>,
    QueryKey,
    number
  >({
    queryKey: [...CARD_REVIEWS_QUERY_KEY_ROOT, kind, id],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getCardReviews(kind, id, { page: pageParam, perPage: DEFAULT_PER_PAGE }, signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.total_pages
        ? lastPage.pagination.page + 1
        : undefined,
    enabled: id > 0,
    staleTime: 30_000,
  });
}

/**
 * Watchers are offset-paginated (`offset` / `limit` / `has_more`), like
 * useGroupMembers.
 */
export function useCardWatchers(kind: EntityCardKind, id: number) {
  return useInfiniteQuery<
    CardWatchersResponse,
    BccApiError,
    InfiniteData<CardWatchersResponse>,
    QueryKey,
    number
  >({
    queryKey: [...CARD_WATCHERS_QUERY_KEY_ROOT, kind, id],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getCardWatchers(kind, id, { offset: pageParam, limit: DEFAULT_LIMIT }, signal),
    // Advance by what the server ACTUALLY returned, not by `limit`.
    // useGroupMembers adds `limit`, which is equivalent while every page is
    // full — but a short page with `has_more: true` would skip rows, and the
    // accumulator this replaces walked by `items.length`. Preserving that
    // keeps the sequence identical to the behaviour being replaced.
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more
        ? lastPage.pagination.offset + lastPage.items.length
        : undefined,
    enabled: id > 0,
    staleTime: 30_000,
  });
}
