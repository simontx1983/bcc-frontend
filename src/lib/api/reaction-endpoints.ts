/**
 * Typed wrappers for /reactions.
 *
 * Both endpoints accept a `feed_id` (e.g. "feed_1234") and return
 * the canonical FeedReactions shape — same structure carried on
 * each FeedItem, so the response patches the feed cache directly.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { FeedReactions, ReactionKind } from "@/lib/api/types";

export interface SetReactionRequest {
  feed_id: string;
  reaction: ReactionKind;
}

/**
 * POST /reactions — set / replace the viewer's reaction on a feed
 * item. Idempotent on same-kind set; swap on different-kind set.
 */
export function setReaction(request: SetReactionRequest): Promise<FeedReactions> {
  return bccFetchAsClient<FeedReactions>("reactions", {
    method: "POST",
    body: request,
  });
}

/**
 * DELETE /reactions/{feed_id} — remove the viewer's reaction.
 * Idempotent — removing when nothing is set is a no-op.
 */
export function removeReaction(feedId: string): Promise<FeedReactions> {
  // feed_id is server-emitted ("feed_<n>") — encodeURIComponent
  // belt-and-suspenders against any future shape change.
  return bccFetchAsClient<FeedReactions>(`reactions/${encodeURIComponent(feedId)}`, {
    method: "DELETE",
  });
}
