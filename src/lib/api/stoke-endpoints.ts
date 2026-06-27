/**
 * Typed wrappers for /feed/{id}/stoke.
 *
 * Unlike /reactions (set/replace, one kind per viewer), Stoke is a
 * capped accumulator — each call adds (or removes) one stoke; the
 * server enforces the per-user cap (~5). Both endpoints return the
 * canonical FeedReactions shape, same as /reactions, so the response
 * patches the feed cache directly.
 *
 * The route is keyed by the bare numeric activity id (matching
 * `GET /feed/{id}`), not the "feed_<n>" wire id every FeedItem carries
 * — callers strip the prefix before building the path.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { FeedReactions } from "@/lib/api/types";

function actIdFromFeedId(feedId: string): string {
  return feedId.startsWith("feed_") ? feedId.slice("feed_".length) : feedId;
}

/** POST /feed/{id}/stoke — add one stoke. No-ops server-side past the cap. */
export function setStoke(feedId: string): Promise<FeedReactions> {
  return bccFetchAsClient<FeedReactions>(`feed/${encodeURIComponent(actIdFromFeedId(feedId))}/stoke`, {
    method: "POST",
  });
}

/** DELETE /feed/{id}/stoke — remove one stoke. Idempotent at zero. */
export function removeStoke(feedId: string): Promise<FeedReactions> {
  return bccFetchAsClient<FeedReactions>(`feed/${encodeURIComponent(actIdFromFeedId(feedId))}/stoke`, {
    method: "DELETE",
  });
}
