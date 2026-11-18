"use client";

/**
 * useReviewReply — F-345 mutations over POST|PATCH|DELETE /reviews/{id}/reply.
 *
 * On success the server's answer is written into every cached Reviews
 * page that holds the row (the returned `reply`, or null in whichever
 * slot a delete emptied: `reply` or `viewer_stale_reply`),
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
  CardReviewsResponse,
  DeleteReviewReplyResponse,
  ReviewReply,
  ReviewReplyResponse,
} from "@/lib/api/types";

export interface ReviewReplyWriteVars {
  reviewId: number;
  body: string;
}

/**
 * Which of the row's two reply fields a write touched. `viewer_stale_reply`
 * is the viewer's own reply after the page changed hands; deleting it must
 * leave the new party's public `reply` alone.
 */
export type ReviewReplySlot = "reply" | "viewer_stale_reply";

export interface DeleteReviewReplyVars {
  reviewId: number;
  slot: ReviewReplySlot;
}

function settle(
  queryClient: QueryClient,
  reviewId: number,
  patch: Partial<Record<ReviewReplySlot, ReviewReply | null>>,
): void {
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

/** Edits the public reply only: a stale reply's `can_edit` is always denied. */
export function useUpdateReviewReply() {
  const queryClient = useQueryClient();
  return useMutation<ReviewReplyResponse, BccApiError, ReviewReplyWriteVars>({
    mutationFn: ({ reviewId, body }) => updateReviewReply(reviewId, { body }),
    onSuccess: (res, { reviewId }) => settle(queryClient, reviewId, { reply: res.reply }),
  });
}

/** DELETE removes the viewer's own reply; the server knows which one that is. */
export function useDeleteReviewReply() {
  const queryClient = useQueryClient();
  return useMutation<DeleteReviewReplyResponse, BccApiError, DeleteReviewReplyVars>({
    mutationFn: ({ reviewId }) => deleteReviewReply(reviewId),
    onSuccess: (_res, { reviewId, slot }) =>
      settle(queryClient, reviewId, slot === "reply" ? { reply: null } : { viewer_stale_reply: null }),
  });
}
