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
  watch_batch:   "WATCHED",
  page_claim:    "CLAIMED",
  review:        "REVIEWED",
  dispute:       "DISPUTED",
  drop:          "DROPPED",
  release:       "RELEASED",
  signal:        "SIGNAL",
  blog_excerpt:  "PUBLISHED",
};

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

  if (item.post_kind === "dispute") {
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
