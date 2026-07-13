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
  keepPreviousData,
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
  CommentSort,
  CommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  DeleteCommentResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 20;

const DEFAULT_SORT: CommentSort = "relevant";

/**
 * Prefix key — keyed by feed_id so each post's drawer has its own cache.
 * Each sort caches independently under `[...prefix, sort]` (see
 * `commentsListQueryKey`); the write mutations patch across every cached
 * sort variant by matching this prefix, so a new/deleted/stoked comment
 * stays consistent whichever tab the viewer switches to.
 */
export function commentsQueryKey(feedId: string): QueryKey {
  return ["comments", feedId];
}

/** Exact list key for one sort — the dimension that makes each tab its own cache. */
export function commentsListQueryKey(feedId: string, sort: CommentSort): QueryKey {
  return ["comments", feedId, sort];
}

export function useComments(
  feedId: string,
  options: { enabled?: boolean; sort?: CommentSort } = {},
) {
  const enabled = options.enabled ?? true;
  const sort = options.sort ?? DEFAULT_SORT;
  return useInfiniteQuery<
    CommentsResponse,
    BccApiError,
    InfiniteData<CommentsResponse>,
    QueryKey,
    string | null
  >({
    queryKey: commentsListQueryKey(feedId, sort),
    enabled: enabled && feedId !== "",
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      listComments({
        feedId,
        cursor: pageParam ?? undefined,
        limit: PAGE_SIZE,
        sort,
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
    // Keep the current tab's rows on screen while a newly-selected sort
    // loads, so switching Relevant/Top/New doesn't flash the skeleton.
    placeholderData: keepPreviousData,
  });
}

/**
 * Snapshot of every cached sort variant for one feed's comments (each
 * `[queryKey, data]` pair from `getQueriesData`), captured for rollback.
 */
export type CommentsSnapshot = Array<[QueryKey, InfiniteData<CommentsResponse> | undefined]>;

export function restoreCommentsSnapshot(
  queryClient: QueryClient,
  snapshot: CommentsSnapshot | undefined,
): void {
  if (snapshot === undefined) return;
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

interface CreateMutationContext {
  /** Snapshot of every cached sort variant, for rollback on error. */
  prevData: CommentsSnapshot;
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
      // Prefix key → patch every cached sort variant at once.
      const key = commentsQueryKey(req.feed_id);
      await queryClient.cancelQueries({ queryKey: key });

      const prevData = queryClient.getQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key });
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
        // §3.5 optimistic attachment — the composer passes the media it
        // already resolved (uploaded photo URL / picked gif URL) so the
        // image paints instantly; the server row replaces it onSuccess.
        ...(req.media !== undefined ? { media: req.media } : {}),
      };

      // Prepend to the first page of every cached sort. For top/relevant
      // this shows the fresh (zero-stoke) comment above its eventual
      // sorted slot; the next refetch reconciles the order. New is exact.
      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (oldData) => {
        if (oldData === undefined) return oldData;
        const [firstPage, ...rest] = oldData.pages;
        if (firstPage === undefined) return oldData;
        return {
          ...oldData,
          pages: [
            { ...firstPage, items: [optimistic, ...firstPage.items] },
            ...rest,
          ],
        };
      });

      bumpFeedCommentCount(queryClient, req.feed_id, +1);
      const userContext = (await options.onMutate?.(req, undefined as never)) ?? {};
      return { prevData, optimisticId, ...userContext };
    },

    onError: (_err, req, context) => {
      restoreCommentsSnapshot(queryClient, context?.prevData);
      bumpFeedCommentCount(queryClient, req.feed_id, -1);
    },

    onSuccess: (response, req, context) => {
      const key = commentsQueryKey(req.feed_id);
      const optimisticId = context?.optimisticId;
      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (oldData) => {
        if (oldData === undefined) return oldData;
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
  prevData: CommentsSnapshot;
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

      const prevData = queryClient.getQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key });
      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (oldData) => {
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
      const userContext = (await options.onMutate?.(params, undefined as never)) ?? {};
      return { prevData, ...userContext };
    },

    onError: (_err, params, context) => {
      restoreCommentsSnapshot(queryClient, context?.prevData);
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
