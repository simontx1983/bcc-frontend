"use client";

/**
 * useCommentStoke — optimistic Stoke toggle for a single comment.
 *
 * Mirrors useStoke's snapshot → patch → restore-on-error →
 * overwrite-with-server-on-success shape, but the target lives in the
 * `["comments", feedId]` infinite-query cache (one row among many pages)
 * rather than the feed. One stoke per person (X-"like"): the optimistic
 * patch flips `viewer_has_stoked` and nudges `stoke_count` by one on the
 * matching row, guarded so a double-fire can't double-apply. There is no
 * `heat_stage` on comments — a comment stoke is a plain like, so the
 * server response is just the `{ stoke_count, viewer_has_stoked }` pair.
 */

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import { removeCommentStoke, setCommentStoke } from "@/lib/api/comment-endpoints";
import {
  commentsQueryKey,
  restoreCommentsSnapshot,
  type CommentsSnapshot,
} from "@/hooks/useComments";
import type {
  BccApiError,
  Comment,
  CommentStokeResponse,
  CommentsResponse,
} from "@/lib/api/types";

interface CommentStokeVars {
  commentId: string;
  /** The row's current stoke state — decides add vs. remove and the optimistic direction. */
  hasStoked: boolean;
}

interface CommentStokeContext {
  /** Snapshot of every cached sort variant for rollback ([queryKey, data] pairs). */
  prevData: CommentsSnapshot;
}

/**
 * Patch one comment row (by id) across every cached page.
 * `patch` returns the mutated stoke fields to merge onto the match.
 */
function patchCommentRow(
  data: InfiniteData<CommentsResponse> | undefined,
  commentId: string,
  patch: (row: Comment) => Pick<Comment, "stoke_count" | "viewer_has_stoked">,
): InfiniteData<CommentsResponse> | undefined {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((row) =>
        row.id === commentId ? { ...row, ...patch(row) } : row,
      ),
    })),
  };
}

export function useCommentStoke(feedId: string) {
  const queryClient = useQueryClient();
  // Prefix key — the same comment row lives in each cached sort variant
  // (`["comments", feedId, sort]`), so patch/snapshot across all of them.
  const key = commentsQueryKey(feedId);

  return useMutation<CommentStokeResponse, BccApiError, CommentStokeVars, CommentStokeContext>({
    mutationFn: ({ commentId, hasStoked }) =>
      hasStoked ? removeCommentStoke(commentId) : setCommentStoke(commentId),

    onMutate: async ({ commentId, hasStoked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prevData = queryClient.getQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key });

      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (data) =>
        patchCommentRow(data, commentId, (row) => {
          const currently = row.viewer_has_stoked ?? false;
          const count = row.stoke_count ?? 0;
          // Guard against a double-fire re-applying: only move when the
          // row still matches the state this toggle was launched from.
          if (currently !== hasStoked) {
            return { stoke_count: count, viewer_has_stoked: currently };
          }
          return hasStoked
            ? { stoke_count: Math.max(0, count - 1), viewer_has_stoked: false }
            : { stoke_count: count + 1, viewer_has_stoked: true };
        }),
      );

      return { prevData };
    },

    onSuccess: (server, { commentId }) => {
      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (data) =>
        patchCommentRow(data, commentId, () => ({
          stoke_count: server.stoke_count,
          viewer_has_stoked: server.viewer_has_stoked,
        })),
      );
    },

    onError: (_err, _vars, context) => {
      restoreCommentsSnapshot(queryClient, context?.prevData);
    },
  });
}
