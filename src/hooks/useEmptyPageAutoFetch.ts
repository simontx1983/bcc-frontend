"use client";

/**
 * useEmptyPageAutoFetch — what a cursor-paged feed does when every page
 * so far came back EMPTY while the server says more exist.
 *
 * The per-viewer filter (blocks, hidden reposts) runs after the server
 * cuts a page, so a page can arrive empty with `has_more: true`. That is
 * not an empty feed: the empty state would tell the viewer the room is
 * quiet when the next page may be full. So the feed fetches on by itself,
 * a bounded number of pages, and past the bound the viewer pages on by
 * hand. Bounded so a long run of filtered pages cannot spin.
 *
 * Extracted from FeedBody (#329) for the group wall (F-420), so the two
 * feeds share one rule and one bound.
 *
 * Returns:
 *   - `emptyRun`: no rows yet, the server has more, and nothing failed.
 *     While it is true the caller must not show its empty state.
 *   - `keepAutoFetching`: an empty run still under the bound. The hook is
 *     fetching the next page; the caller shows its loading state.
 *   Past the bound (`emptyRun && !keepAutoFetching`) the caller shows a
 *   manual "Load more", and keeps it mounted while that fetch runs.
 */

import { useEffect } from "react";

/**
 * How many further pages are fetched on their own while every page so far
 * came back empty but the server says more exist.
 */
export const EMPTY_PAGE_AUTO_FETCH_LIMIT = 3;

interface EmptyPageRunInput {
  /** Rows across every page fetched so far (after the per-viewer filter). */
  itemCount: number;
  /** Pages fetched so far, the first included. */
  pageCount: number;
  hasNextPage: boolean;
  /** Any read failure: a failed next page must never be auto-fetched into. */
  isError: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}

export function useEmptyPageAutoFetch({
  itemCount,
  pageCount,
  hasNextPage,
  isError,
  isFetchingNextPage,
  fetchNextPage,
}: EmptyPageRunInput): { emptyRun: boolean; keepAutoFetching: boolean } {
  const emptyRun = itemCount === 0 && hasNextPage && !isError;
  // The pages beyond the first are exactly the next-page fetches that have
  // run, so the bound needs no state of its own.
  const pagesFetchedAfterFirst = Math.max(0, pageCount - 1);
  const keepAutoFetching = emptyRun && pagesFetchedAfterFirst < EMPTY_PAGE_AUTO_FETCH_LIMIT;

  useEffect(() => {
    if (keepAutoFetching && !isFetchingNextPage) void fetchNextPage();
  }, [keepAutoFetching, isFetchingNextPage, fetchNextPage]);

  return { emptyRun, keepAutoFetching };
}
