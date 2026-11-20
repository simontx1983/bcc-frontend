"use client";

/**
 * useRepost — F-346 writes.
 *
 *   - useToggleRepost: the PLAIN repost (POST /feed/{id}/repost, or DELETE
 *     to undo). Once per member per root.
 *   - useCreateQuoteRepost: a QUOTE (POST /feed/{id}/quote). Unlimited; a
 *     new post with its own text.
 *
 * Not optimistic: either write creates or removes a real post on the
 * viewer's wall, so it only reads as done once the server has it. On
 * success the server's counts go into every cached copy of the same root
 * (`patchRepostState`), then the listings that can hold the new or removed
 * post refetch.
 *
 * A 409 on POST (already reposted) or a 404 on DELETE (nothing to undo)
 * means the cache is stale — another tab or device moved it — so the
 * listings refetch to show the server's truth.
 */

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import { patchRepostState } from "@/hooks/useFeedCache";
import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import { createQuoteRepost, createRepost, removeRepost } from "@/lib/api/repost-endpoints";
import { BccApiError, type QuoteRepostResponse, type RepostState } from "@/lib/api/types";

function refetchListings(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
  void queryClient.invalidateQueries({ queryKey: GROUP_FEED_QUERY_KEY_ROOT });
  void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
}

export interface ToggleRepostVars {
  feedId: string;
  /** The state the viewer tapped from: true → undo, false → repost. */
  reposted: boolean;
}

export function useToggleRepost() {
  const queryClient = useQueryClient();
  return useMutation<RepostState, BccApiError, ToggleRepostVars>({
    mutationFn: ({ feedId, reposted }) => (reposted ? removeRepost(feedId) : createRepost(feedId)),
    onSuccess: (state) => {
      patchRepostState(queryClient, state);
      // The plain repost post appears on, or leaves, the viewer's wall.
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
    },
    onError: (err, { reposted }) => {
      if (!(err instanceof BccApiError)) return;
      const stale = reposted ? err.code === "bcc_not_found" : err.code === "bcc_conflict";
      if (stale) {
        refetchListings(queryClient);
        // Every ["feedItem", id] detail cache.
        void queryClient.invalidateQueries({ queryKey: FEED_ITEM_QUERY_KEY("").slice(0, 1) });
      }
    },
  });
}

export function useCreateQuoteRepost() {
  const queryClient = useQueryClient();
  return useMutation<QuoteRepostResponse, BccApiError, { feedId: string; body: string }>({
    mutationFn: ({ feedId, body }) => createQuoteRepost(feedId, body),
    onSuccess: (state) => {
      patchRepostState(queryClient, state);
      // A quote is a new post, so the listings refetch as after any new post.
      refetchListings(queryClient);
    },
  });
}
