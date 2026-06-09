/**
 * Typed wrapper for GET /hashtags/trending.
 *
 * Goes through `bccFetchAsClient` — the trending block is a
 * client-rendered sidebar widget on the same bcc/v1 API as the feed
 * (mirrors feed-endpoints.ts). NOT the bcc-search client; this is
 * PeepSo-hashtag data, a distinct feature from useTrendingSearches.
 *
 * Server returns rows in trending order; the frontend renders them
 * as-is (no client-side ranking). `count` is presentation metadata
 * for the hover title only.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { TrendingHashtagsResponse } from "@/lib/api/types";

export function getTrendingHashtags(
  limit = 8,
  signal?: AbortSignal
): Promise<TrendingHashtagsResponse> {
  const path = `hashtags/trending?limit=${limit}`;
  return bccFetchAsClient<TrendingHashtagsResponse>(path, { method: "GET", signal });
}
