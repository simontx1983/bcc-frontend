"use client";

/**
 * Stoke mutation hooks.
 *
 * Mirrors useReactions.ts's optimistic-update pattern (snapshot → patch
 * → restore-on-error → overwrite-with-server-on-success), reusing its
 * generic cache-walking helpers directly since the infinite-query
 * lookup-by-id is reaction-shape-agnostic.
 *
 * Unlike a reaction (set/replace one kind), a stoke ADDS — so the
 * optimistic patch increments `viewer_stoke_count` (capped at 5
 * client-side; the server is the real enforcement) rather than
 * swapping a `viewer_reaction` kind. `heat_stage` is NOT guessed
 * optimistically — it's a server-computed velocity aggregate, so the
 * rail keeps rendering the pre-mutation stage until the server
 * response (or the next refetch) lands.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeStoke, setStoke } from "@/lib/api/stoke-endpoints";
import {
  patchFeedItem,
  restoreSnapshots,
  snapshotMatchingPages,
  type SetMutationContext,
} from "@/hooks/useReactions";
import { FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import type { BccApiError, FeedReactions, FeedItem } from "@/lib/api/types";

const STOKE_CAP = 5;

export function useStokeMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, string, SetMutationContext>({
    mutationFn: (feedId) => setStoke(feedId),

    onMutate: async (feedId) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      const snapshots = snapshotMatchingPages(queryClient, feedId);
      patchFeedItem(queryClient, feedId, (item) => applyOptimisticStoke(item));
      return { snapshots };
    },

    onSuccess: (serverState, feedId) => {
      patchFeedItem(queryClient, feedId, () => serverState);
    },

    onError: (_err, _feedId, context) => {
      restoreSnapshots(queryClient, context?.snapshots ?? []);
    },
  });
}

export function useUnstokeMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, string, SetMutationContext>({
    mutationFn: (feedId) => removeStoke(feedId),

    onMutate: async (feedId) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      const snapshots = snapshotMatchingPages(queryClient, feedId);
      patchFeedItem(queryClient, feedId, (item) => applyOptimisticUnstoke(item));
      return { snapshots };
    },

    onSuccess: (serverState, feedId) => {
      patchFeedItem(queryClient, feedId, () => serverState);
    },

    onError: (_err, _feedId, context) => {
      restoreSnapshots(queryClient, context?.snapshots ?? []);
    },
  });
}

function applyOptimisticStoke(item: FeedItem): FeedReactions {
  const prev = item.reactions;
  const current = prev.viewer_stoke_count ?? 0;
  if (current >= STOKE_CAP) {
    return prev;
  }
  return { ...prev, viewer_stoke_count: current + 1 };
}

function applyOptimisticUnstoke(item: FeedItem): FeedReactions {
  const prev = item.reactions;
  const current = prev.viewer_stoke_count ?? 0;
  if (current <= 0) {
    return prev;
  }
  return { ...prev, viewer_stoke_count: current - 1 };
}
