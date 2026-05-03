"use client";

/**
 * useCreatePost — POST /posts (§D1 status composer).
 *
 * On success: invalidate every feed surface that could surface this
 * new post so refetches pull it through the canonical FeedRankingService
 * hydration path. We deliberately don't optimistically splice the new
 * post into the cache — cursor-based pagination + missing author/
 * reactions/permissions hydration would force a complex shape-mismatch
 * reconciliation. A 200-300ms refetch is the simpler V1 ship.
 *
 * Invalidated roots:
 *   - FEED_QUERY_KEY_ROOT          — authed Floor (For You / Following / Signals)
 *   - HOT_FEED_QUERY_KEY           — anon Floor (also hot-fallback for zero-follow authed)
 *   - USER_ACTIVITY_QUERY_KEY_ROOT — every per-user wall (composer can mount on
 *                                    /u/:handle/Activity for owners; the post's
 *                                    author wall must refetch immediately)
 *   - HIGHLIGHTS_QUERY_KEY         — "your activity got X solids" slot can shift
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { createPost } from "@/lib/api/posts-endpoints";
import type {
  BccApiError,
  CreatePostRequest,
  CreatePostResponse,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

export function useCreatePostMutation(
  options: Omit<
    UseMutationOptions<CreatePostResponse, BccApiError, CreatePostRequest>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<CreatePostResponse, BccApiError, CreatePostRequest>({
    mutationFn: (req) => createPost(req),
    ...options,
    // Spread-arg forwarding stays arity-agnostic across TanStack
    // Query versions (v5 added a 4th `mutateOptions` parameter).
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      return options.onSuccess?.(...args);
    },
  });
}
