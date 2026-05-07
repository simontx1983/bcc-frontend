/**
 * Typed wrappers for /posts/:feed_id/comments (api-contract-v1.md §4.13).
 *
 * Three endpoints:
 *   - GET    /posts/:feed_id/comments              — paginated list
 *   - POST   /posts/:feed_id/comments              — create
 *   - DELETE /posts/:feed_id/comments/:comment_id  — delete (own only)
 *
 * Cursor encoding matches /feed — base64url(json({t, id})). The hook
 * layer handles cursor threading; these wrappers are just typed
 * fetch glue.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  DeleteCommentResponse,
} from "@/lib/api/types";

export interface ListCommentsParams {
  feedId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** GET /posts/:feed_id/comments — paginated list. */
export function listComments(params: ListCommentsParams): Promise<CommentsResponse> {
  const { feedId, cursor, limit } = params;
  const search = new URLSearchParams();
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  if (cursor !== undefined && cursor !== "") {
    search.set("cursor", cursor);
  }
  const qs   = search.toString();
  const path = `posts/${encodeURIComponent(feedId)}/comments${qs ? `?${qs}` : ""}`;

  return bccFetchAsClient<CommentsResponse>(path, { method: "GET" });
}

/** POST /posts/:feed_id/comments — create. */
export function createComment(request: CreateCommentRequest): Promise<CreateCommentResponse> {
  return bccFetchAsClient<CreateCommentResponse>(
    `posts/${encodeURIComponent(request.feed_id)}/comments`,
    {
      method: "POST",
      body: { body: request.body },
    }
  );
}

export interface DeleteCommentParams {
  feedId: string;
  commentId: string;
}

/**
 * DELETE /posts/:feed_id/comments/:comment_id — delete viewer's own
 * comment. Server enforces ownership; viewer-not-author returns
 * `bcc_forbidden` 403.
 */
export function deleteComment(params: DeleteCommentParams): Promise<DeleteCommentResponse> {
  const { feedId, commentId } = params;
  return bccFetchAsClient<DeleteCommentResponse>(
    `posts/${encodeURIComponent(feedId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );
}
