"use client";

/**
 * useHighlights — query + dismiss-mutation for the §O2 strip.
 *
 * Cache strategy:
 *   - 60s stale time. The server already returns no-store, but client-
 *     side we don't want to refetch on every nav back to the Floor —
 *     the strip is "what changed in the last few minutes," not a
 *     ticker. Window-focus refetch is on so a user returning to a
 *     long-open tab gets fresh items.
 *
 * Optimistic dismiss:
 *   - onMutate snapshots the items list and removes the dismissed id
 *     immediately. The strip collapses smoothly without a refetch.
 *   - onError restores the snapshot.
 *   - onSuccess does NOT refetch — the item stays dismissed by id, and
 *     the rest of the strip is fine as-is. A follow-up `getHighlights()`
 *     on stale-time elapse picks up server-side changes naturally.
 *
 * The hook is auth-required at the API layer — callers should gate
 * mounting by viewer state (the Floor page passes `isAuthenticated`).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  dismissHighlight,
  getHighlights,
} from "@/lib/api/highlights-endpoints";
import type {
  BccApiError,
  DismissHighlightResponse,
  HighlightsResponse,
} from "@/lib/api/types";

export const HIGHLIGHTS_QUERY_KEY = ["me", "highlights"] as const;

export function useHighlights() {
  return useQuery<HighlightsResponse>({
    queryKey: HIGHLIGHTS_QUERY_KEY,
    queryFn: ({ signal }) => getHighlights(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

interface DismissContext {
  /** Snapshot of the previous strip — restored on error. */
  previous: HighlightsResponse | undefined;
}

export function useDismissHighlightMutation() {
  const queryClient = useQueryClient();

  return useMutation<DismissHighlightResponse, BccApiError, string, DismissContext>({
    mutationFn: (id) => dismissHighlight(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const previous = queryClient.getQueryData<HighlightsResponse>(HIGHLIGHTS_QUERY_KEY);

      if (previous !== undefined) {
        queryClient.setQueryData<HighlightsResponse>(HIGHLIGHTS_QUERY_KEY, {
          ...previous,
          items: previous.items.filter((item) => item.id !== id),
        });
      }

      return { previous };
    },

    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(HIGHLIGHTS_QUERY_KEY, context.previous);
      }
    },
  });
}
