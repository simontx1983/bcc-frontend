/**
 * Typed wrapper for /posts (per §D1 of the V1 plan).
 *
 * Client-only — POST /posts requires auth (the Bearer JWT is attached
 * by `bccFetchAsClient`). V1 exposes status posts (open to all signed-
 * in viewers) and reviews (gated server-side on Level 2 + reputation
 * tier ≥ neutral via FeatureAccessService).
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreateBlogRequest,
  CreatePostRequest,
  CreatePostResponse,
  CreateReviewRequest,
} from "@/lib/api/types";

/**
 * POST /posts — create a status post, §D2 review, or §D6 blog post.
 *
 * Common errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_invalid_request — empty / over-cap content, or unknown `kind`
 *   - bcc_unavailable     — PeepSo deactivated server-side
 *
 * Review-specific errors (in addition):
 *   - bcc_forbidden       — viewer hasn't unlocked write_review
 *                           (Level 2 + reputation ≥ neutral)
 *   - bcc_invalid_request — missing target_page_id, bad grade, or
 *                           body over REVIEW_BODY_MAX_LENGTH
 *
 * Blog-specific errors (in addition):
 *   - bcc_invalid_request — excerpt outside 80..500 chars, full_text
 *                           empty or over BLOG_FULL_TEXT_MAX_LENGTH
 *   - bcc_rate_limited    — burst seatbelt fired
 */
export function createPost(
  request: CreatePostRequest
): Promise<CreatePostResponse> {
  // Default to status when caller omits kind. The discriminant has to
  // be present so the server doesn't fall back to `status` for blog
  // requests that just happen to omit `kind` due to bad cast.
  const body =
    "kind" in request && (request.kind === "review" || request.kind === "blog")
      ? request
      : { kind: "status" as const, ...request };

  return bccFetchAsClient<CreatePostResponse>("posts", {
    method: "POST",
    body,
  });
}

/**
 * Convenience wrapper for the review-specific path. Same endpoint as
 * createPost — having a typed entry point keeps callers honest about
 * the required fields (`target_page_id` + `grade` + `content`).
 */
export function createReview(
  request: Omit<CreateReviewRequest, "kind">
): Promise<CreatePostResponse> {
  return createPost({ kind: "review", ...request });
}

/**
 * Convenience wrapper for the blog-specific path. Same endpoint as
 * createPost. `excerpt` becomes the Floor teaser; `content` becomes
 * the full body that surfaces in the per-user blog tab.
 */
export function createBlog(
  request: Omit<CreateBlogRequest, "kind">
): Promise<CreatePostResponse> {
  return createPost({ kind: "blog", ...request });
}

/**
 * DELETE /me/reviews/:page_id — remove the viewer's review on the
 * target page. Idempotent; calling on a page where no review exists
 * still returns 200.
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_invalid_request — bad page id
 *   - bcc_unavailable     — vote service rejected the removal
 */
export function removeReview(
  pageId: number
): Promise<{ ok: true; page_id: number }> {
  return bccFetchAsClient<{ ok: true; page_id: number }>(
    `me/reviews/${pageId}`,
    { method: "DELETE" }
  );
}
