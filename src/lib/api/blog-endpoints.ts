/**
 * Typed wrapper for /users/:handle/blog (§D6 blog tab read surface).
 *
 * Cursor-paginated; same FeedItem shape as the Floor feed — but the
 * body contains both `excerpt` and `full_text` (Floor only carries
 * `excerpt`; full_text is null there).
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { FeedResponse } from "@/lib/api/types";

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
