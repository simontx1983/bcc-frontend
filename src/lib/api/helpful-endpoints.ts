/**
 * Typed wrappers for the §9.2 "Mark helpful" endorsement routes.
 *
 * Four routes, one response shape:
 *   - POST   /feed/{id}/helpful      — mark a post helpful (idempotent)
 *   - DELETE /feed/{id}/helpful      — un-mark a post (idempotent)
 *   - POST   /comments/{id}/helpful  — mark a comment helpful
 *   - DELETE /comments/{id}/helpful  — un-mark a comment
 *
 * A Helpful mark is NOT a reaction/like write. Unlike /stoke (cosmetic
 * feed heat) it is the sanctioned, credibility-gated Rank "helping"
 * evidence route — the server decides whether a marker is credible and
 * whether the mark grants the author rank credit; the frontend never
 * gates on that. No request body; every verb returns the same
 * `{ helpful_count, viewer_has_marked }` pair.
 *
 * Both routes are keyed by the bare numeric activity id, matching
 * /stoke and GET /feed/{id}. Callers hold the wire id (`feed_<n>` for a
 * post, `comment_<n>` for a comment); we strip the prefix here so a
 * caller can pass whatever id it already has.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { HelpfulMarkResponse } from "@/lib/api/types";

/** Which surface the mark targets — selects the `/feed` vs `/comments` route. */
export type HelpfulKind = "feed" | "comment";

function actIdFromFeedId(feedId: string): string {
  return feedId.startsWith("feed_") ? feedId.slice("feed_".length) : feedId;
}

function actIdFromCommentId(commentId: string): string {
  return commentId.startsWith("comment_") ? commentId.slice("comment_".length) : commentId;
}

function helpfulPath(kind: HelpfulKind, id: string): string {
  if (kind === "feed") {
    return `feed/${encodeURIComponent(actIdFromFeedId(id))}/helpful`;
  }
  return `comments/${encodeURIComponent(actIdFromCommentId(id))}/helpful`;
}

/** POST — mark the target (post or comment) helpful. Idempotent server-side. */
export function markHelpful(kind: HelpfulKind, id: string): Promise<HelpfulMarkResponse> {
  return bccFetchAsClient<HelpfulMarkResponse>(helpfulPath(kind, id), { method: "POST" });
}

/** DELETE — remove the viewer's helpful mark. Idempotent at zero. */
export function unmarkHelpful(kind: HelpfulKind, id: string): Promise<HelpfulMarkResponse> {
  return bccFetchAsClient<HelpfulMarkResponse>(helpfulPath(kind, id), { method: "DELETE" });
}
