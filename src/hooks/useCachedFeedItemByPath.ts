"use client";

/**
 * useCachedFeedItemByPath — for `post/[id]/loading.tsx` and its shortcode
 * sibling: is the post the viewer is navigating to already sitting in the
 * React Query cache from the feed they just clicked off of?
 *
 * The obvious approach — look up `FEED_ITEM_QUERY_KEY(idFromUrl)` — only
 * works for the numeric `/post/[id]` dev-fallback route. The real
 * navigation path is `item.links.self`, which is the shortcode permalink
 * (`/u/[handle]/post/[shortcode]`, bcc-trust #82) — a value the URL alone
 * can't be turned back into a cache key. So instead this scans every
 * currently cached query for a `FeedItem` (or a feed list's items) whose
 * own `links.self` equals the current pathname — the same field every
 * feed surface already trusts for permalink construction, no shortcode
 * parsing required. Structural checks (`"pages" in data` / `"links" in
 * data`) keep this cheap despite not filtering by query key up front, and
 * it works for any current or future feed surface without needing its
 * query key added here.
 */

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import type { FeedItem, FeedResponse } from "@/lib/api/types";

function isInfiniteFeedData(data: unknown): data is InfiniteData<FeedResponse> {
  return (
    data !== null &&
    typeof data === "object" &&
    "pages" in data &&
    Array.isArray((data as { pages: unknown }).pages)
  );
}

function isFeedItem(data: unknown): data is FeedItem {
  return data !== null && typeof data === "object" && "links" in data && "id" in data;
}

export function useCachedFeedItemByPath(): FeedItem | null {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  for (const [, data] of queryClient.getQueriesData({})) {
    if (isFeedItem(data)) {
      if (data.links.self === pathname) return data;
      continue;
    }
    if (isInfiniteFeedData(data)) {
      for (const page of data.pages) {
        const hit = page.items.find((item) => item.links.self === pathname);
        if (hit !== undefined) return hit;
      }
    }
  }

  return null;
}
