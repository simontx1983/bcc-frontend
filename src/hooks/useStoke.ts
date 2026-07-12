"use client";

/**
 * Stoke mutation hooks.
 *
 * Mirrors useReactions.ts's optimistic-update pattern (snapshot → patch
 * → restore-on-error → overwrite-with-server-on-success), reusing its
 * generic cache-walking helpers directly since the infinite-query
 * lookup-by-id is reaction-shape-agnostic.
 *
 * One stoke per person (X-"like" model) — `viewer_has_stoked` is a
 * boolean toggle, not a counter. The optimistic patch flips the
 * viewer's own fill state and nudges the public `stoke_count` by one,
 * guarded so a double-fire (e.g. a stale re-render) can't double-apply.
 * `heat_stage` is NOT guessed optimistically — it's a server-computed
 * velocity aggregate, so the rail keeps rendering the pre-mutation
 * stage until the server response (or the next refetch) lands.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeStoke, setStoke } from "@/lib/api/stoke-endpoints";
import {
  patchFeedItem,
  restoreFeed,
  snapshotFeed,
  type SetMutationContext,
} from "@/hooks/useFeedCache";
import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import type { BccApiError, FeedReactions, FeedItem } from "@/lib/api/types";

export function useStokeMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, string, SetMutationContext>({
    mutationFn: (feedId) => setStoke(feedId),

    onMutate: async (feedId) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      await queryClient.cancelQueries({ queryKey: FEED_ITEM_QUERY_KEY(feedId) });
      const context = snapshotFeed(queryClient, feedId);
      patchFeedItem(queryClient, feedId, (item) => applyOptimisticStoke(item));
      return context;
    },

    onSuccess: (serverState, feedId) => {
      patchFeedItem(queryClient, feedId, () => serverState);
    },

    onError: (_err, _feedId, context) => {
      restoreFeed(queryClient, context);
    },
  });
}

export function useUnstokeMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, string, SetMutationContext>({
    mutationFn: (feedId) => removeStoke(feedId),

    onMutate: async (feedId) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      await queryClient.cancelQueries({ queryKey: FEED_ITEM_QUERY_KEY(feedId) });
      const context = snapshotFeed(queryClient, feedId);
      patchFeedItem(queryClient, feedId, (item) => applyOptimisticUnstoke(item));
      return context;
    },

    onSuccess: (serverState, feedId) => {
      patchFeedItem(queryClient, feedId, () => serverState);
    },

    onError: (_err, _feedId, context) => {
      restoreFeed(queryClient, context);
    },
  });
}

function applyOptimisticStoke(item: FeedItem): FeedReactions {
  const prev = item.reactions;
  if (prev.viewer_has_stoked === true) {
    return prev;
  }
  return {
    ...prev,
    viewer_has_stoked: true,
    stoke_count: (prev.stoke_count ?? 0) + 1,
  };
}

function applyOptimisticUnstoke(item: FeedItem): FeedReactions {
  const prev = item.reactions;
  if (prev.viewer_has_stoked !== true) {
    return prev;
  }
  return {
    ...prev,
    viewer_has_stoked: false,
    stoke_count: Math.max(0, (prev.stoke_count ?? 0) - 1),
  };
}
