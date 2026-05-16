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
  CreateGifPostRequest,
  CreateGifPostResponse,
  CreatePhotoPostRequest,
  CreatePhotoPostResponse,
  CreatePostRequest,
  CreatePostResponse,
  CreateReviewRequest,
  UpdateBlogRequest,
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
 * the full markdown body that surfaces in the per-user blog tab.
 *
 * Post-PR-A optional fields (auto-picked-up via the type):
 *   - title          — required by V1 composer, optional on the wire
 *   - category       — BlogCategory pick (required by V1 composer)
 *   - tags           — 0..5 free-form pills
 *   - chain_tags     — 0..3 chain slugs (must exist in bcc_onchain_chains)
 *   - disclosure     — { tickers, note } or null
 *   - cover_image_id — WP attachment ID (author must own it)
 *   - status         — "draft" | "publish", defaults "publish"
 *
 * Backward-compatible: callers passing only `excerpt` + `content`
 * continue to work as a published blog post with no title/category/tags.
 */
export function createBlog(
  request: Omit<CreateBlogRequest, "kind">
): Promise<CreatePostResponse> {
  return createPost({ kind: "blog", ...request });
}

/**
 * PATCH /posts/{id} — owner edit for a blog post.
 *
 * Partial-update semantics: omitted fields are left unchanged on the
 * server. Empty `tags`/`chain_tags` arrays mean "clear"; `disclosure:
 * null` clears the disclosure block; `cover_image_id: 0` (or null)
 * un-pins the cover image.
 *
 * The endpoint wraps `wp_save_post_revision()` server-side BEFORE any
 * mutation, so edit history is preserved automatically — no caller
 * action needed.
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_not_found       — post doesn't exist OR isn't a blog post
 *   - bcc_forbidden       — viewer isn't the post_author
 *   - bcc_invalid_request — any validation failure (same shape as
 *                           createBlog)
 *   - bcc_rate_limited    — burst seatbelt fired
 */
export function updateBlog(
  id: number,
  changes: UpdateBlogRequest
): Promise<CreatePostResponse> {
  return bccFetchAsClient<CreatePostResponse>(`posts/${id}`, {
    method: "PATCH",
    body: changes,
  });
}

/**
 * POST /posts/photo — multipart photo upload (v1.5).
 *
 * Separate route from /posts because the request shape is multipart
 * (file + optional caption text field) rather than JSON. The
 * `bccFetchAsClient` wrapper auto-detects FormData bodies and skips
 * the JSON Content-Type override, so the same client works for both.
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_invalid_request — missing photo, multi-file (V1 single-only),
 *                           upload error, oversized, unsupported mime
 *   - bcc_forbidden       — PeepSo permission check refused
 *   - bcc_rate_limited    — burst seatbelt fired
 *   - bcc_unavailable     — PeepSo deactivated, persist failure
 */
export function createPhotoPost(
  request: CreatePhotoPostRequest
): Promise<CreatePhotoPostResponse> {
  const fd = new FormData();
  fd.append("photo", request.file, request.file.name);
  if (request.caption !== undefined && request.caption !== "") {
    fd.append("caption", request.caption);
  }
  return bccFetchAsClient<CreatePhotoPostResponse>("posts/photo", {
    method: "POST",
    body: fd,
  });
}

/**
 * POST /posts/gif — JSON body { url, caption? } (v1.5).
 *
 * Counterpart to createPhotoPost. Wraps PeepSo's existing giphy
 * plugin under the hood; BCC server validates the URL contains
 * `giphy.com` (matches PeepSo's own check). Caption optional.
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_invalid_request — empty URL, URL doesn't contain giphy.com,
 *                           caption over 500 chars
 *   - bcc_forbidden       — PeepSo permission check refused
 *   - bcc_rate_limited    — burst seatbelt fired
 *   - bcc_unavailable     — PeepSo deactivated, persist failure
 */
export function createGifPost(
  request: CreateGifPostRequest
): Promise<CreateGifPostResponse> {
  const body: { url: string; caption?: string } = { url: request.url };
  if (request.caption !== undefined && request.caption !== "") {
    body.caption = request.caption;
  }
  return bccFetchAsClient<CreateGifPostResponse>("posts/gif", {
    method: "POST",
    body,
  });
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

/**
 * PATCH /photos/:pho_id/alt — set or clear the author-supplied alt
 * text on one of the viewer's own photos (v1.5 a11y, §3.3.9 / §4.18).
 *
 * Pass an empty string to clear a previously-set alt — the row is
 * deleted server-side and the §3.3.9 wire shape returns `alt: null`
 * on the next feed read.
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_not_found       — pho_id doesn't exist in peepso_photos
 *   - bcc_forbidden       — pho_id exists but viewer isn't the owner
 *   - bcc_invalid_request — alt over 500 chars after sanitisation
 *   - bcc_unavailable     — DB write failure
 */
export function setPhotoAlt(
  phoId: number,
  alt: string
): Promise<{ pho_id: number; alt: string | null }> {
  return bccFetchAsClient<{ pho_id: number; alt: string | null }>(
    `photos/${phoId}/alt`,
    {
      method: "PATCH",
      body: { alt },
    }
  );
}
