"use client";

/**
 * useReviewReply — F-345 mutations over POST|PATCH|DELETE /reviews/{id}/reply.
 *
 * On success the server's answer is written into every cached Reviews
 * page that holds the row (the returned `reply`, or null after a delete),
 * then both Reviews lists are invalidated so the viewer-scoped
 * permissions (`can_reply`, `reply.permissions`) come back from the
 * server rather than being guessed here. No optimistic state: a reply is
 * public and one-per-review, so it only appears once the server has it.
 */

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { CARD_REVIEWS_QUERY_KEY_ROOT } from "@/hooks/useCardTabs";
import { USER_REVIEWS_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import {
  createReviewReply,
  deleteReviewReply,
  updateReviewReply,
} from "@/lib/api/posts-endpoints";
import type {
  BccApiError,
  CardReview,
  CardReviewsResponse,
  DeleteReviewReplyResponse,
  ReviewReplyResponse,
} from "@/lib/api/types";

export interface ReviewReplyWriteVars {
  reviewId: number;
  body: string;
}

/** The one reply field a write changed: `reply`, or the viewer's stale one (v1.174). */
type ReplyPatch = Partial<Pick<CardReview, "reply" | "viewer_stale_reply">>;

function settle(queryClient: QueryClient, reviewId: number, patch: ReplyPatch): void {
  queryClient.setQueriesData<InfiniteData<CardReviewsResponse>>(
    { queryKey: CARD_REVIEWS_QUERY_KEY_ROOT },
    (old) =>
      old === undefined
        ? old
        : {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((row) => (row.id === reviewId ? { ...row, ...patch } : row)),
            })),
          },
  );
  void queryClient.invalidateQueries({ queryKey: CARD_REVIEWS_QUERY_KEY_ROOT });
  void queryClient.invalidateQueries({ queryKey: USER_REVIEWS_QUERY_KEY_ROOT });
}

export function useCreateReviewReply() {
  const queryClient = useQueryClient();
  return useMutation<ReviewReplyResponse, BccApiError, ReviewReplyWriteVars>({
    mutationFn: ({ reviewId, body }) => createReviewReply(reviewId, { body }),
    onSuccess: (res, { reviewId }) => settle(queryClient, reviewId, { reply: res.reply }),
  });
}

export function useUpdateReviewReply() {
  const queryClient = useQueryClient();
  return useMutation<ReviewReplyResponse, BccApiError, ReviewReplyWriteVars>({
    mutationFn: ({ reviewId, body }) => updateReviewReply(reviewId, { body }),
    onSuccess: (res, { reviewId }) => settle(queryClient, reviewId, { reply: res.reply }),
  });
}

export function useDeleteReviewReply() {
  const queryClient = useQueryClient();
  // `stale`: the viewer's own handed-over reply (v1.174). DELETE removes
  // the viewer's reply either way; only the cached field differs, so the
  // new party's `reply` stays on screen.
  return useMutation<DeleteReviewReplyResponse, BccApiError, { reviewId: number; stale?: boolean }>({
    mutationFn: ({ reviewId }) => deleteReviewReply(reviewId),
    onSuccess: (_res, { reviewId, stale }) =>
      settle(queryClient, reviewId, stale === true ? { viewer_stale_reply: null } : { reply: null }),
  });
}
