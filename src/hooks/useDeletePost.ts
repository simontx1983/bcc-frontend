"use client";

/**
 * useDeletePostMutation — removes a post (own, or any post for a site
 * admin; server-enforced, see PostsService::deletePost).
 *
 * Unlike Stoke/Watch, this isn't applied optimistically — a delete is a
 * deliberate, confirmed action (the caller shows a confirm dialog first),
 * not a low-latency toggle, so there's no UX cost to waiting for the
 * server before the row disappears. On success the item is filtered out
 * of every cached feed page and the single-post detail cache is cleared.
 */

import type { InfiniteData } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteFeedItem } from "@/lib/api/feed-endpoints";
import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import type { BccApiError, FeedResponse } from "@/lib/api/types";

export function useDeletePostMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true; feed_id: string }, BccApiError, string>({
    mutationFn: (feedId) => deleteFeedItem(feedId),

    onSuccess: (_result, feedId) => {
      queryClient.setQueriesData<InfiniteData<FeedResponse>>(
        { queryKey: FEED_QUERY_KEY_ROOT },
        (oldData) => {
          if (oldData === undefined) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== feedId),
            })),
          };
        }
      );
      queryClient.removeQueries({ queryKey: FEED_ITEM_QUERY_KEY(feedId) });
    },
  });
}
