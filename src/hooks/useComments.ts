"use client";

/**
 * useComments / useCreateCommentMutation / useDeleteCommentMutation
 * — cursor-paginated comments + write hooks for §4.13.
 *
 * Cache strategy (mirrors useFeed for the list, useReactions for the
 * mutations):
 *   - List uses `useInfiniteQuery` keyed by ["comments", feedId].
 *   - Create optimistically prepends to the first page; on success,
 *     replaces the optimistic row with the server's canonical Comment
 *     view-model (which carries the real act-id and avatar URL).
 *   - Delete optimistically removes the matching row from every
 *     cached page; on success the server response confirms; on error
 *     the snapshot is restored.
 *
 * The list isn't auto-invalidated on the parent FeedItem's
 * `comment_count` — that field on the FeedItem is a count badge, not
 * a list. The parent feed query gets a separate refetch trigger via
 * `setQueryData` to bump the count optimistically; full reconciliation
 * happens on the next feed refetch.
 *
 * Anonymous viewers can list comments on non-gated posts; create + delete
 * fail at the server (`bcc_unauthorized`).
 */

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  createComment,
  deleteComment,
  listComments,
  type DeleteCommentParams,
} from "@/lib/api/comment-endpoints";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import type {
  BccApiError,
  Comment,
  CommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  DeleteCommentResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 20;

/** Root key — keyed by feed_id so each post's drawer has its own cache. */
export function commentsQueryKey(feedId: string): QueryKey {
  return ["comments", feedId];
}

export function useComments(feedId: string, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useInfiniteQuery<
    CommentsResponse,
    BccApiError,
    InfiniteData<CommentsResponse>,
    QueryKey,
    string | null
  >({
    queryKey: commentsQueryKey(feedId),
    enabled: enabled && feedId !== "",
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      listComments({
        feedId,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
      }).then((res) => {
        // signal is forwarded by react-query for cancellation; the
        // typed wrapper doesn't accept one yet, so we just return.
        // The fetch itself is short-lived so cancellation cost is
        // bounded if the user closes the drawer mid-flight.
        void signal;
        return res;
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
  });
}

interface CreateMutationContext {
  /** Snapshot of the comments cache for rollback on error. */
  prevData: InfiniteData<CommentsResponse> | undefined;
  /** Optimistic comment id we inserted; used to replace on success. */
  optimisticId: string;
}

export function useCreateCommentMutation(
  options: Omit<
    UseMutationOptions<CreateCommentResponse, BccApiError, CreateCommentRequest, CreateMutationContext>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<CreateCommentResponse, BccApiError, CreateCommentRequest, CreateMutationContext>({
    mutationFn: (req) => createComment(req),

    onMutate: async (req) => {
      const key = commentsQueryKey(req.feed_id);
      await queryClient.cancelQueries({ queryKey: key });

      const prevData = queryClient.getQueryData<InfiniteData<CommentsResponse>>(key);
      const optimisticId = `comment_optimistic_${Date.now()}`;

      const optimistic: Comment = {
        id:         optimisticId,
        comment_id: optimisticId,
        feed_id:    req.feed_id,
        author: {
          // Filled out by the server response; on failure the row is
          // rolled back so this stub never reaches stable cache.
          id: 0,
          handle: "",
          display_name: "You",
          avatar_url: "",
        },
        body:      req.body,
        // §3.3.12 — server hydrates `mentions[]` on the real response
        // so the optimistic row's empty overlay is replaced before
        // the user sees a re-render. Empty here is a safe placeholder
        // (renders as plain text; Refresh / refetch lands the real
        // overlay within ~200ms via the onSuccess invalidation).
        mentions:  [],
        posted_at: new Date().toISOString(),
        permissions: { can_delete: { allowed: true, unlock_hint: null } },
      };

      queryClient.setQueryData<InfiniteData<CommentsResponse>>(key, (oldData) => {
        if (oldData === undefined) {
          return {
            pages: [{ items: [optimistic], next_cursor: null }],
            pageParams: [null],
          };
        }
        const [firstPage, ...rest] = oldData.pages;
        if (firstPage === undefined) {
          return oldData;
        }
        return {
          ...oldData,
          pages: [
            { ...firstPage, items: [optimistic, ...firstPage.items] },
            ...rest,
          ],
        };
      });

      bumpFeedCommentCount(queryClient, req.feed_id, +1);
      return { prevData, optimisticId, ...options.onMutate?.(req, undefined as never) };
    },

    onError: (_err, req, context) => {
      const key = commentsQueryKey(req.feed_id);
      if (context?.prevData !== undefined) {
        queryClient.setQueryData(key, context.prevData);
      }
      bumpFeedCommentCount(queryClient, req.feed_id, -1);
    },

    onSuccess: (response, req, context) => {
      const key = commentsQueryKey(req.feed_id);
      queryClient.setQueryData<InfiniteData<CommentsResponse>>(key, (oldData) => {
        if (oldData === undefined) {
          return oldData;
        }
        const optimisticId = context?.optimisticId;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === optimisticId ? response.comment : item
            ),
          })),
        };
      });
    },
    ...options,
  });
}

interface DeleteMutationContext {
  prevData: InfiniteData<CommentsResponse> | undefined;
}

export function useDeleteCommentMutation(
  options: Omit<
    UseMutationOptions<DeleteCommentResponse, BccApiError, DeleteCommentParams, DeleteMutationContext>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<DeleteCommentResponse, BccApiError, DeleteCommentParams, DeleteMutationContext>({
    mutationFn: (params) => deleteComment(params),

    onMutate: async (params) => {
      const key = commentsQueryKey(params.feedId);
      await queryClient.cancelQueries({ queryKey: key });

      const prevData = queryClient.getQueryData<InfiniteData<CommentsResponse>>(key);
      queryClient.setQueryData<InfiniteData<CommentsResponse>>(key, (oldData) => {
        if (oldData === undefined) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== params.commentId),
          })),
        };
      });

      bumpFeedCommentCount(queryClient, params.feedId, -1);
      return { prevData, ...options.onMutate?.(params, undefined as never) };
    },

    onError: (_err, params, context) => {
      const key = commentsQueryKey(params.feedId);
      if (context?.prevData !== undefined) {
        queryClient.setQueryData(key, context.prevData);
      }
      bumpFeedCommentCount(queryClient, params.feedId, +1);
    },
    ...options,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Feed comment-count optimistic patch
//
// When a comment is added/removed the parent FeedItem's
// `comment_count` should reflect the change immediately. We walk every
// feed-namespace infinite query (Floor + Hot + per-user wall) and
// patch the matching item in place. Same shape as useReactions's
// `patchFeedItem` — the count is one field on `FeedItem`.
// ─────────────────────────────────────────────────────────────────────

import type { FeedItem, FeedResponse } from "@/lib/api/types";
import type { QueryClient } from "@tanstack/react-query";

function bumpFeedCommentCount(
  queryClient: QueryClient,
  feedId: string,
  delta: number
): void {
  const update = (item: FeedItem): FeedItem => ({
    ...item,
    comment_count: Math.max(0, (item.comment_count ?? 0) + delta),
  });

  for (const key of [FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY, USER_ACTIVITY_QUERY_KEY_ROOT]) {
    queryClient.setQueriesData<InfiniteData<FeedResponse>>(
      { queryKey: key },
      (oldData) => {
        if (oldData === undefined) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === feedId ? update(item) : item
            ),
          })),
        };
      }
    );
  }
}
