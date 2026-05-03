"use client";

/**
 * Reaction mutation hooks.
 *
 * Optimistic updates patch the feed cache surgically — we DON'T
 * invalidate the entire feed namespace, because that would refetch
 * the whole infinite-query and lose the user's scroll position. The
 * pattern:
 *
 *   1. onMutate    → snapshot every infinite-query page that contains
 *                    the target feed_id, mutate the matching item's
 *                    `reactions` block in place
 *   2. onError     → restore the snapshot
 *   3. onSuccess   → replace the optimistic block with the server's
 *                    canonical response (counts may differ from the
 *                    optimistic guess if other users reacted between
 *                    request and response)
 *
 * Cache scope: all `["feed", ...]` and `["feed", "hot"]` infinite
 * queries are scanned. The viewer probably has at most 2-3 of those
 * active at a time (different scope tabs); per-mutation cost is
 * bounded.
 *
 * No reaction-cache invalidation — the surgical patch is the cache
 * update.
 */

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { removeReaction, setReaction, type SetReactionRequest } from "@/lib/api/reaction-endpoints";
import { FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import type {
  BccApiError,
  FeedReactions,
  FeedItem,
  FeedResponse,
  ReactionKind,
} from "@/lib/api/types";

interface SetMutationContext {
  /** Snapshot of every feed page we touched, keyed by query key (JSON). */
  snapshots: Array<{ queryKey: readonly unknown[]; data: InfiniteData<FeedResponse> | undefined }>;
}

export function useSetReactionMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, SetReactionRequest, SetMutationContext>({
    mutationFn: (request) => setReaction(request),

    onMutate: async (request) => {
      // Cancel in-flight refetches so they don't clobber our optimistic state.
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });

      const snapshots = snapshotMatchingPages(queryClient, request.feed_id);
      patchFeedItem(queryClient, request.feed_id, (item) =>
        applyOptimisticSet(item, request.reaction)
      );
      return { snapshots };
    },

    onSuccess: (serverState, request) => {
      // Server is the source of truth — overwrite optimistic state.
      patchFeedItem(queryClient, request.feed_id, () => serverState);
    },

    onError: (_err, _request, context) => {
      restoreSnapshots(queryClient, context?.snapshots ?? []);
    },
  });
}

export function useRemoveReactionMutation() {
  const queryClient = useQueryClient();

  return useMutation<FeedReactions, BccApiError, string, SetMutationContext>({
    mutationFn: (feedId) => removeReaction(feedId),

    onMutate: async (feedId) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      const snapshots = snapshotMatchingPages(queryClient, feedId);
      patchFeedItem(queryClient, feedId, (item) => applyOptimisticRemove(item));
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

// ─────────────────────────────────────────────────────────────────────
// Cache-mutation helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Snapshot every feed-namespace infinite-query that contains the
 * target feed_id. Restorable on error.
 */
function snapshotMatchingPages(
  queryClient: QueryClient,
  feedId: string
): SetMutationContext["snapshots"] {
  const queries = queryClient.getQueriesData<InfiniteData<FeedResponse>>({
    queryKey: FEED_QUERY_KEY_ROOT,
  });

  const snapshots: SetMutationContext["snapshots"] = [];
  for (const [key, data] of queries) {
    if (data === undefined) continue;
    if (containsFeedId(data, feedId)) {
      snapshots.push({ queryKey: key, data });
    }
  }
  return snapshots;
}

function restoreSnapshots(
  queryClient: QueryClient,
  snapshots: SetMutationContext["snapshots"]
): void {
  for (const { queryKey, data } of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

/**
 * Walk every feed-namespace infinite query and apply `update` to
 * the matching item. The update returns the new `reactions` block.
 */
function patchFeedItem(
  queryClient: QueryClient,
  feedId: string,
  update: (item: FeedItem) => FeedReactions
): void {
  queryClient.setQueriesData<InfiniteData<FeedResponse>>(
    { queryKey: FEED_QUERY_KEY_ROOT },
    (oldData) => {
      if (oldData === undefined) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === feedId
              ? { ...item, reactions: update(item) }
              : item
          ),
        })),
      };
    }
  );
}

function containsFeedId(data: InfiniteData<FeedResponse>, feedId: string): boolean {
  for (const page of data.pages) {
    for (const item of page.items) {
      if (item.id === feedId) return true;
    }
  }
  return false;
}

/**
 * Optimistic counts after the viewer sets `nextKind`:
 *
 *   - if nextKind === viewer_reaction → no-op (idempotent)
 *   - else, decrement viewer_reaction's count (if any), increment nextKind's
 *
 * Returns the new FeedReactions block.
 */
function applyOptimisticSet(item: FeedItem, nextKind: ReactionKind): FeedReactions {
  const prev = item.reactions;
  if (prev.viewer_reaction === nextKind) {
    return prev;
  }

  const nextCounts: Record<string, number> = { ...prev.counts };

  if (prev.viewer_reaction !== null) {
    const currentCount = nextCounts[prev.viewer_reaction] ?? 0;
    nextCounts[prev.viewer_reaction] = Math.max(0, currentCount - 1);
  }
  nextCounts[nextKind] = (nextCounts[nextKind] ?? 0) + 1;

  return {
    counts: nextCounts,
    viewer_reaction: nextKind,
  };
}

function applyOptimisticRemove(item: FeedItem): FeedReactions {
  const prev = item.reactions;
  if (prev.viewer_reaction === null) {
    return prev;
  }

  const nextCounts: Record<string, number> = { ...prev.counts };
  const currentCount = nextCounts[prev.viewer_reaction] ?? 0;
  nextCounts[prev.viewer_reaction] = Math.max(0, currentCount - 1);

  return {
    counts: nextCounts,
    viewer_reaction: null,
  };
}
