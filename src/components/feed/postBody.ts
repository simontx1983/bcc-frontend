/**
 * postBody — server-safe pure helpers for feed post bodies.
 *
 * These are mechanical label/summary mappings over the server view-model
 * (§A2: no business logic — they only read fields the backend already
 * populated). They live OUTSIDE `FeedPostBody.tsx` because that module is
 * `"use client"` (PhotoBody/GifBody own Lightbox state), and a server
 * component (`PostDetail` on the `/post/[id]` route) can't call a function
 * exported from a client module. Keeping the pure helpers here lets both
 * the server permalink page and the client feed card import them.
 */

import type { FeedItem } from "@/lib/api/types";

export const POST_KIND_LABELS: Record<string, string> = {
  status:        "POSTED",
  photo:         "POSTED",
  gif:           "POSTED",
  watch_batch:    "WATCHED",
  page_claim:     "CLAIMED",
  review:         "REVIEWED",
  // Real contract value (FeedItemNormalizer.php, bcc-core) — "dispute" is
  // only a legacy string-key shim never actually written to a real row.
  dispute_signed: "DISPUTED",
  drop:           "DROPPED",
  release:        "RELEASED",
  signal:         "SIGNAL",
  blog_excerpt:   "PUBLISHED",
};

/**
 * Kinds that carry NO engagement affordances: no Stoke, no Mark helpful.
 *
 * A CLOSED inventory — contract §4.32.15. An announcement is an official
 * information billboard on a validator page, not a post competing for
 * engagement, so it contributes nothing to trust/reputation/fraud scoring
 * and nothing to engagement-based feed boosts.
 *
 * ## Why this list exists at all, rather than a reaction grammar
 *
 * Registering `announcement` in the post-kind → grammar map would be a
 * FALSE FIX. The `kind_grammar` / `counts` / `viewer_reaction` trio is
 * still hydrated on the wire but is **unread by this client**: the
 * per-kind reaction rail was replaced by a single Stoke control that
 * reads `heat_stage` / `viewer_has_stoked` / `stoke_count` and never
 * consults the grammar. Any grammar — `trust`, `social`, even an empty
 * one — changes nothing a reader can see.
 *
 * Two further traps make the server-side half insufficient on its own:
 *
 *   1. The reaction block is never omitted. The normalizer emits
 *      `reactions ?? emptyReactionsFor($postKind)`, and an unregistered
 *      kind defaults to the SOCIAL grammar — so doing nothing produces a
 *      zero-filled `{like, love, haha, wow, fire}` dict on an operator's
 *      official notice.
 *   2. `ReactionRail`'s fallback is fail-OPEN by design. When the stoke
 *      fields are absent — exactly what a not-yet-shipped backend sends —
 *      it still renders a flame, lighting it from any non-zero legacy
 *      count, and "never throws, never blanks the rail". The read-only
 *      variant only DISABLES the control; it still renders it.
 *
 * So the suppression is keyed on the item's own kind and on NOTHING else.
 * It must not consult `reactions`, `helpful_count`, `viewer_has_marked`,
 * `heat_stage` or any other payload field, because the whole point is to
 * hold when a legacy or malformed payload carries those fields populated.
 *
 * ⚠ This is the CLIENT half of a deliberately redundant pair. The server
 * refuses the stoke and helpful-mark writes for module 205 even if a
 * client regresses; this renders nothing even if the server regresses and
 * sends a social grammar with counts. Neither half depends on the other
 * being correct.
 *
 * ⚠ Nothing here changes any other kind. The inventory is closed and
 * currently holds one entry, so every other kind's behaviour is
 * byte-identical.
 *
 * KEPT for announcements: the comment control (it navigates to the
 * permalink, where the discussion lives), Share, the permalink itself and
 * the announcement bar. Only the engagement signals go.
 */
export const KINDS_WITHOUT_ENGAGEMENT: readonly string[] = ["announcement"];

/**
 * May this kind show Stoke and Mark-helpful controls?
 *
 * Reads the kind and nothing else — see `KINDS_WITHOUT_ENGAGEMENT`. A
 * non-string kind (a malformed payload) is treated as unknown rather than
 * as a suppressed kind, which keeps the default for every real kind and
 * fails toward existing behaviour instead of silently stripping controls
 * from posts.
 */
export function hasEngagementControls(postKind: unknown): boolean {
  if (typeof postKind !== "string") return true;
  return !KINDS_WITHOUT_ENGAGEMENT.includes(postKind);
}

// ─────────────────────────────────────────────────────────────────────
// Per-kind body → summary text. Reads body fields the server wrote;
// fallback is the post_kind label so unknown kinds still render.
// ─────────────────────────────────────────────────────────────────────

export function deriveBodySummary(item: FeedItem): string {
  const body = item.body;

  if (item.post_kind === "status") {
    return readString(body, "text") ?? "";
  }

  if (item.post_kind === "watch_batch") {
    const cardCount = readNumber(body, "card_count") ?? 0;
    const moreCount = readNumber(body, "more_count") ?? 0;
    if (cardCount === 0) return "";
    const noun = cardCount === 1 ? "card" : "cards";
    if (moreCount > 0) {
      return `Started watching ${cardCount} ${noun} (+${moreCount} more).`;
    }
    return `Started watching ${cardCount} ${noun}.`;
  }

  // page_claim's summary is server-rendered (§A2). When the backend
  // ships a body.summary/body.text field for claim posts, the generic
  // fallback below picks it up; until then claim items render with
  // just the kind label + author.

  // Review + blog_excerpt have dedicated body renderers —
  // bail out so the generic summary line doesn't double-render.
  if (item.post_kind === "review" || item.post_kind === "blog_excerpt") {
    return "";
  }

  if (item.post_kind === "dispute_signed") {
    return readString(body, "reason") ?? "Signed a dispute.";
  }

  // Unknown kind — render any text field the server provided, else empty.
  return readString(body, "text") ?? readString(body, "summary") ?? "";
}

export function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}

export function readNumber(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  return typeof value === "number" ? value : null;
}
