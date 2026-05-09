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

import { createGifPost, createPhotoPost, createPost } from "@/lib/api/posts-endpoints";
import type {
  BccApiError,
  CreateGifPostRequest,
  CreateGifPostResponse,
  CreatePhotoPostRequest,
  CreatePhotoPostResponse,
  CreatePostRequest,
  CreatePostResponse,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

/**
 * Resolve the optional group_id payload from any of the three create-post
 * request shapes. Centralised so all three hooks stay aligned: when a
 * post lands inside a group's wall (§4.7.6), we invalidate that group's
 * feed in addition to the standard global feed roots, so the new post
 * appears in `/groups/[slug]` without a manual refetch.
 */
function resolveTargetGroupId(req: { group_id?: number }): number | null {
  const id = req.group_id;
  return typeof id === "number" && id > 0 ? id : null;
}

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
      // §4.7.6 — when the post was scoped to a group, invalidate that
      // group's feed so /groups/[slug] surfaces the new item without
      // a manual refetch. CreateReviewRequest / CreateBlogRequest don't
      // carry group_id; the type guard via resolveTargetGroupId is the
      // single seam handling all three request shapes.
      const variables = args[1] as { group_id?: number };
      const groupId = resolveTargetGroupId(variables);
      if (groupId !== null) {
        void queryClient.invalidateQueries({
          queryKey: [...GROUP_FEED_QUERY_KEY_ROOT, groupId],
        });
      }
      return options.onSuccess?.(...args);
    },
  });
}

/**
 * v1.5 GIF-post mutation. Mirrors `useCreatePostMutation` /
 * `useCreatePhotoPostMutation` cache invalidation surface (Floor /
 * Hot / per-user wall / highlights). Kept parallel to make the
 * three-way submit branch in the composer obvious — text vs file
 * vs URL.
 */
export function useCreateGifPostMutation(
  options: Omit<
    UseMutationOptions<CreateGifPostResponse, BccApiError, CreateGifPostRequest>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<CreateGifPostResponse, BccApiError, CreateGifPostRequest>({
    mutationFn: (req) => createGifPost(req),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const groupId = resolveTargetGroupId(args[1]);
      if (groupId !== null) {
        void queryClient.invalidateQueries({
          queryKey: [...GROUP_FEED_QUERY_KEY_ROOT, groupId],
        });
      }
      return options.onSuccess?.(...args);
    },
  });
}

/**
 * v1.5 photo-post mutation. Mirrors `useCreatePostMutation`'s cache
 * invalidation surface (Floor / Hot / per-user wall / highlights) so
 * a photo post lands in the same feed roots as a status post — no
 * separate cache namespace because photo + status are both
 * `social-grammar` post_kinds in the same feed stream.
 *
 * Kept as a sibling hook (not a discriminated union on the existing
 * mutation) because the request shape is fundamentally different:
 * FormData-multipart vs JSON. Keeping the two hooks parallel makes
 * the boundary obvious in callers — `useCreatePostMutation()` for
 * text, `useCreatePhotoPostMutation()` when there's a file. Both
 * are auth-gated upstream by the inline composer's mount condition.
 */
export function useCreatePhotoPostMutation(
  options: Omit<
    UseMutationOptions<CreatePhotoPostResponse, BccApiError, CreatePhotoPostRequest>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<CreatePhotoPostResponse, BccApiError, CreatePhotoPostRequest>({
    mutationFn: (req) => createPhotoPost(req),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      const groupId = resolveTargetGroupId(args[1]);
      if (groupId !== null) {
        void queryClient.invalidateQueries({
          queryKey: [...GROUP_FEED_QUERY_KEY_ROOT, groupId],
        });
      }
      return options.onSuccess?.(...args);
    },
  });
}
