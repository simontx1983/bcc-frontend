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
  CommentSort,
  CommentStokeResponse,
  CommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  DeleteCommentResponse,
} from "@/lib/api/types";

/**
 * Comment ids are `comment_<act_id>`; the stoke route is keyed by the
 * bare numeric act_id (matching `/feed/{id}/stoke`). Strip the prefix.
 */
function actIdFromCommentId(commentId: string): string {
  return commentId.startsWith("comment_")
    ? commentId.slice("comment_".length)
    : commentId;
}

/** POST /comments/:id/stoke — add the viewer's stoke. Idempotent server-side. */
export function setCommentStoke(commentId: string): Promise<CommentStokeResponse> {
  return bccFetchAsClient<CommentStokeResponse>(
    `comments/${encodeURIComponent(actIdFromCommentId(commentId))}/stoke`,
    { method: "POST" }
  );
}

/** DELETE /comments/:id/stoke — remove the viewer's stoke. Idempotent at zero. */
export function removeCommentStoke(commentId: string): Promise<CommentStokeResponse> {
  return bccFetchAsClient<CommentStokeResponse>(
    `comments/${encodeURIComponent(actIdFromCommentId(commentId))}/stoke`,
    { method: "DELETE" }
  );
}

export interface ListCommentsParams {
  feedId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  sort?: CommentSort | undefined;
}

/** GET /posts/:feed_id/comments — paginated list. */
export function listComments(params: ListCommentsParams): Promise<CommentsResponse> {
  const { feedId, cursor, limit, sort } = params;
  const search = new URLSearchParams();
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  if (sort !== undefined) {
    search.set("sort", sort);
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
  const body: {
    body: string;
    attachment_id?: number;
    gif_url?: string;
    parent_id?: string;
  } = {
    body: request.body,
  };
  // §3.5 one attachment per comment — photo wins if both are set.
  if (request.attachment_id !== undefined && request.attachment_id > 0) {
    body.attachment_id = request.attachment_id;
  } else if (request.gif_url !== undefined && request.gif_url !== "") {
    body.gif_url = request.gif_url;
  }
  // §3.5 threading — reply target; omitted for a top-level comment.
  if (request.parent_id !== undefined && request.parent_id !== "") {
    body.parent_id = request.parent_id;
  }

  return bccFetchAsClient<CreateCommentResponse>(
    `posts/${encodeURIComponent(request.feed_id)}/comments`,
    { method: "POST", body }
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
