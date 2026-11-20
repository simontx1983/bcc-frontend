/**
 * Typed wrappers for /feed/{id}/repost and /feed/{id}/quote (F-346).
 *
 * Keyed on the bare activity id, like /stoke. The server keys everything
 * on the chain ROOT: reposting or quoting a repost acts on the original,
 * and the response's `root_feed_id` names the post the counts belong to.
 *
 * Two routes, two rules: a PLAIN repost is once per member per root (409
 * on a second; DELETE undoes it), a QUOTE is unlimited and takes a
 * required body.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import { actIdFromFeedId } from "@/lib/api/stoke-endpoints";
import type { QuoteRepostResponse, RepostState } from "@/lib/api/types";

function feedPath(feedId: string, action: "repost" | "quote"): string {
  return `feed/${encodeURIComponent(actIdFromFeedId(feedId))}/${action}`;
}

/** POST — the plain repost. No body. 409 when the viewer already has one. */
export function createRepost(feedId: string): Promise<RepostState> {
  return bccFetchAsClient<RepostState>(feedPath(feedId, "repost"), { method: "POST" });
}

/** DELETE — undoes the viewer's PLAIN repost only (never a quote). None → 404. */
export function removeRepost(feedId: string): Promise<RepostState> {
  return bccFetchAsClient<RepostState>(feedPath(feedId, "repost"), { method: "DELETE" });
}

/** POST — a quote repost: a new post with a 1–500 character body. Unlimited. */
export function createQuoteRepost(feedId: string, body: string): Promise<QuoteRepostResponse> {
  return bccFetchAsClient<QuoteRepostResponse>(feedPath(feedId, "quote"), {
    method: "POST",
    body: { body },
  });
}
