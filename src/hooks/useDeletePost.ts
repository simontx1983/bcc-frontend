"use client";

/**
 * useDeletePostMutation — removes a post (own, or any post for a site
 * admin; server-enforced, see PostsService::deletePost).
 *
 * Unlike Stoke/Watch, this isn't applied optimistically — a delete is a
 * deliberate, confirmed action (the caller shows a confirm dialog first),
 * not a low-latency toggle, so there's no UX cost to waiting for the
 * server before the row disappears. On success the item is filtered out
 * of every cached listing (main feed, group/Hall streams, profile walls)
 * and the single-post detail cache is cleared — see removeFeedItem.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteFeedItem } from "@/lib/api/feed-endpoints";
import { removeFeedItem } from "@/hooks/useFeedCache";
import type { BccApiError } from "@/lib/api/types";

export function useDeletePostMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true; feed_id: string }, BccApiError, string>({
    mutationFn: (feedId) => deleteFeedItem(feedId),

    onSuccess: (_result, feedId) => {
      removeFeedItem(queryClient, feedId);
    },
  });
}
