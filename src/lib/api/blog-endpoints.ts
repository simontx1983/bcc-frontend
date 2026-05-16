/**
 * Typed wrappers for the §D6 blog surfaces.
 *
 * Read paths:
 *   - GET /users/:handle/blog — paginated blog tab feed (FeedItem rows
 *     with full_text hydrated, unlike the Floor)
 *   - GET /blog/chain-options — picker source for the composer's
 *     chain-tag multi-select (anonymous-readable)
 *
 * Write paths:
 *   - POST /blog/cover-image — multipart cover-image upload (returns
 *     `attachment_id` to pass back in CreateBlogRequest /
 *     UpdateBlogRequest)
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  BlogChainOptionsResponse,
  BlogCoverImageUploadResponse,
  FeedResponse,
} from "@/lib/api/types";

interface GetUserBlogParams {
  handle: string;
  cursor?: string | null;
  limit?: number;
}

export function getUserBlog(
  params: GetUserBlogParams,
  signal?: AbortSignal
): Promise<FeedResponse> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path =
    `users/${encodeURIComponent(params.handle)}/blog` +
    (qs !== "" ? `?${qs}` : "");

  return bccFetchAsClient<FeedResponse>(path, {
    method: "GET",
    signal,
  });
}

/**
 * GET /blog/chain-options — picker source for the composer's
 * chain-tag multi-select. Returns active rows from
 * `bcc_onchain_chains` with the display fields (color, icon_url).
 *
 * Anonymous-readable; cache-friendly server-side (the chain list
 * changes rarely).
 */
export function getBlogChainOptions(
  signal?: AbortSignal
): Promise<BlogChainOptionsResponse> {
  return bccFetchAsClient<BlogChainOptionsResponse>("blog/chain-options", {
    method: "GET",
    signal,
  });
}

/**
 * POST /blog/cover-image — multipart cover-image upload.
 *
 * Wraps WP-native `wp_handle_upload` + `wp_insert_attachment`
 * server-side. Returns the attachment id (later passed back in
 * `CreateBlogRequest.cover_image_id` / `UpdateBlogRequest.cover_image_id`)
 * plus the resolved URL + dimensions for the composer preview.
 *
 * Validation:
 *   - mime ∈ {image/jpeg, image/png, image/webp, image/gif}
 *   - size ≤ 8 MB (server const BLOG_COVER_MAX_BYTES)
 *
 * Errors:
 *   - bcc_unauthorized    — no session
 *   - bcc_invalid_request — missing/oversized/bad-mime/multi-file
 *   - bcc_rate_limited    — burst seatbelt fired (5/min/user)
 *   - bcc_unavailable     — wp_handle_upload failed
 */
export function uploadBlogCoverImage(
  file: File
): Promise<BlogCoverImageUploadResponse> {
  const fd = new FormData();
  fd.append("cover_image", file, file.name);
  return bccFetchAsClient<BlogCoverImageUploadResponse>("blog/cover-image", {
    method: "POST",
    body: fd,
  });
}
