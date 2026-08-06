"use client";

/**
 * "Mark helpful" mutation hooks (§9.2) — the deliberate endorsement,
 * kept separate from the cosmetic Stoke hooks on purpose.
 *
 * Two surfaces, one shape each:
 *   - useMarkHelpful()          → toggles a POST's mark.
 *   - useMarkHelpfulComment(id) → toggles a COMMENT's mark, scoped to
 *                                 its parent post's comment cache.
 *
 * Both follow the same snapshot → optimistic-patch → restore-on-error →
 * overwrite-with-server-on-success pattern the Stoke hooks use, but they
 * patch the TOP-LEVEL `helpful_count`/`viewer_has_marked` fields (an
 * endorsement is not a reaction, so it never touches the `reactions`
 * block). `hasMarked` (the row's current mark state) decides add vs.
 * remove and the optimistic direction; the toggle is guarded so a
 * double-fire can't double-apply.
 *
 * Old-backend tolerance: the view-models may not hydrate the pair yet.
 * When absent, the optimistic patch seeds from a neutral 0/false and the
 * server response supplies the real truth. A 404/error (a backend that
 * predates the route) rolls the optimistic patch back — the control
 * no-ops quietly, never crashes; the surfaced `error` is the caller's to
 * ignore.
 */

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { markHelpful, unmarkHelpful } from "@/lib/api/helpful-endpoints";
import {
  restoreFeed,
  snapshotFeed,
  type SetMutationContext,
} from "@/hooks/useFeedCache";
import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import {
  commentsQueryKey,
  restoreCommentsSnapshot,
  type CommentsSnapshot,
} from "@/hooks/useComments";
import type {
  BccApiError,
  Comment,
  CommentsResponse,
  FeedItem,
  FeedResponse,
  HelpfulMarkResponse,
} from "@/lib/api/types";

/** The mark fields, isolated so a patch replaces exactly the endorsement pair. */
type HelpfulFields = Pick<FeedItem, "helpful_count" | "viewer_has_marked">;

/**
 * Compute the next mark pair from a row's current state. `hasMarked` is
 * the state the toggle was launched from; if the row no longer matches it
 * (a double-fire, or the server already answered), leave it untouched.
 */
function nextHelpful(
  currentMarked: boolean | undefined,
  currentCount: number | undefined,
  launchedFromMarked: boolean,
): HelpfulFields {
  const marked = currentMarked ?? false;
  const count = currentCount ?? 0;
  if (marked !== launchedFromMarked) {
    return { helpful_count: count, viewer_has_marked: marked };
  }
  return launchedFromMarked
    ? { helpful_count: Math.max(0, count - 1), viewer_has_marked: false }
    : { helpful_count: count + 1, viewer_has_marked: true };
}

// ─────────────────────────────────────────────────────────────────────
// Feed posts
// ─────────────────────────────────────────────────────────────────────

interface PostHelpfulVars {
  feedId: string;
  /** The post's current mark state — decides add vs. remove. */
  hasMarked: boolean;
}

/** Patch the post's mark pair everywhere it's cached (feed pages + detail). */
function patchFeedHelpful(
  queryClient: QueryClient,
  feedId: string,
  update: (item: FeedItem) => HelpfulFields,
): void {
  queryClient.setQueriesData<InfiniteData<FeedResponse>>(
    { queryKey: FEED_QUERY_KEY_ROOT },
    (old) => {
      if (old === undefined) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === feedId ? { ...item, ...update(item) } : item,
          ),
        })),
      };
    },
  );

  queryClient.setQueryData<FeedItem>(FEED_ITEM_QUERY_KEY(feedId), (old) =>
    old === undefined ? old : { ...old, ...update(old) },
  );
}

export function useMarkHelpful() {
  const queryClient = useQueryClient();

  return useMutation<HelpfulMarkResponse, BccApiError, PostHelpfulVars, SetMutationContext>({
    mutationFn: ({ feedId, hasMarked }) =>
      hasMarked ? unmarkHelpful("feed", feedId) : markHelpful("feed", feedId),

    onMutate: async ({ feedId, hasMarked }) => {
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      await queryClient.cancelQueries({ queryKey: FEED_ITEM_QUERY_KEY(feedId) });
      const context = snapshotFeed(queryClient, feedId);
      patchFeedHelpful(queryClient, feedId, (item) =>
        nextHelpful(item.viewer_has_marked, item.helpful_count, hasMarked),
      );
      return context;
    },

    onSuccess: (server, { feedId }) => {
      patchFeedHelpful(queryClient, feedId, () => ({
        helpful_count: server.helpful_count,
        viewer_has_marked: server.viewer_has_marked,
      }));
    },

    onError: (_err, _vars, context) => {
      restoreFeed(queryClient, context);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────

interface CommentHelpfulVars {
  commentId: string;
  /** The comment row's current mark state — decides add vs. remove. */
  hasMarked: boolean;
}

interface CommentHelpfulContext {
  prevData: CommentsSnapshot;
}

/** Patch one comment row's mark pair across every cached sort variant. */
function patchCommentHelpful(
  data: InfiniteData<CommentsResponse> | undefined,
  commentId: string,
  patch: (row: Comment) => HelpfulFields,
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

export function useMarkHelpfulComment(feedId: string) {
  const queryClient = useQueryClient();
  const key = commentsQueryKey(feedId);

  return useMutation<HelpfulMarkResponse, BccApiError, CommentHelpfulVars, CommentHelpfulContext>({
    mutationFn: ({ commentId, hasMarked }) =>
      hasMarked ? unmarkHelpful("comment", commentId) : markHelpful("comment", commentId),

    onMutate: async ({ commentId, hasMarked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prevData = queryClient.getQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key });

      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (data) =>
        patchCommentHelpful(data, commentId, (row) =>
          nextHelpful(row.viewer_has_marked, row.helpful_count, hasMarked),
        ),
      );

      return { prevData };
    },

    onSuccess: (server, { commentId }) => {
      queryClient.setQueriesData<InfiniteData<CommentsResponse>>({ queryKey: key }, (data) =>
        patchCommentHelpful(data, commentId, () => ({
          helpful_count: server.helpful_count,
          viewer_has_marked: server.viewer_has_marked,
        })),
      );
    },

    onError: (_err, _vars, context) => {
      restoreCommentsSnapshot(queryClient, context?.prevData);
    },
  });
}
