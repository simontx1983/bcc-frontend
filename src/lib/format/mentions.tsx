/**
 * §3.3.12 mention overlay rendering helpers.
 *
 * Single source of truth for two operations BCC's UI does in many
 * places:
 *
 *   - `renderTextWithMentions(text, mentions)` walks raw body text +
 *     the §3.3.12 overlay and returns ReactNode (text fragments +
 *     `<Link href="/u/:handle">@displayName</Link>` mention pills).
 *
 *   - `readMentions(body)` defensively narrows an arbitrary body
 *     `Record<string, unknown>` to a `Mention[]` — used by feed
 *     bodies (status / photo / gif) where the body shape is loose.
 *
 * §3.3.12 INVARIANT: range offsets reference RAW stored content
 * (UTF-16 code units, matching JS `String.prototype.substring`).
 * No markdown / emoji / format passes are allowed before this step.
 *
 * Visual treatment is intentionally minimal: a `text-blueprint` link
 * with hover underline. The pill UX (rounded-full background, etc.)
 * is a v2 refinement — keeping V1d "just a link" matches the rest of
 * BCC's prose surfaces (author handles in headers, etc.) and avoids
 * fighting whitespace-pre-line layout in long captions.
 */

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import { MentionHovercard } from "@/components/identity/MentionHovercard";

import type { Mention } from "@/lib/api/types";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Comments read straight off PeepSo's `post_excerpt` column via raw SQL
 * (CommentRepository), bypassing every WordPress content-filter that
 * would normally reverse this on output: `add_comment` runs the body
 * through `htmlspecialchars()` (so `'` becomes the literal 6-character
 * string `&#039;`), and WordPress's own `wp_encode_emoji()` converts
 * 4-byte emoji into `&#x1f602;`-style hex entities for pre-utf8mb4 DB
 * compatibility. Feed posts don't go through either path (bcc-trust's
 * own write path), which is why only comments showed this. Decoding is
 * safe here because the result only ever reaches a plain-text React
 * node (Fragment), never `dangerouslySetInnerHTML` — a decoded `<script>`
 * substring still renders as inert text, not markup.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (Number.isNaN(code)) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_HTML_ENTITIES[entity] ?? match;
  });
}

export function renderTextWithMentions(
  text: string,
  mentions: Mention[]
): ReactNode {
  if (text === "") return null;
  if (mentions.length === 0) return decodeHtmlEntities(text);

  // Defensive sort — server emits in document order today, but we
  // never trust unordered overlays. Overlapping ranges (server bug
  // OR future formatting layer that violates §3.3.12) are dropped
  // first-wins to keep the slice math monotonic.
  const sorted = [...mentions].sort((a, b) => a.range[0] - b.range[0]);

  const out: ReactNode[] = [];
  let cursor = 0;
  let key    = 0;

  for (const m of sorted) {
    const [start, end] = m.range;
    if (start < cursor) continue;
    if (start > cursor) {
      out.push(
        <Fragment key={`t-${key++}`}>
          {decodeHtmlEntities(text.substring(cursor, start))}
        </Fragment>
      );
    }
    out.push(
      <MentionHovercard
        key={`m-${key++}-${m.user_id}`}
        handle={m.handle}
        userId={m.user_id}
        displayName={m.display_name}
      >
        <Link
          href={`/u/${m.handle}` as Route}
          className="text-[var(--bcc-accent)] hover:underline"
        >
          @{m.display_name}
        </Link>
      </MentionHovercard>
    );
    cursor = end;
  }
  if (cursor < text.length) {
    out.push(
      <Fragment key={`t-${key++}`}>{decodeHtmlEntities(text.substring(cursor))}</Fragment>
    );
  }
  return out;
}

/**
 * Defensively narrow an arbitrary body record to a `Mention[]`.
 *
 * Used by feed body renderers (status / photo / gif) where the body
 * shape is loose. Returns `[]` when the field is absent, malformed,
 * or carries individual rows that fail the §3.3.12 shape contract.
 *
 * Comments (which have a strongly-typed `Comment.mentions: Mention[]`
 * field per types.ts) MAY pass `comment.mentions` directly to
 * `renderTextWithMentions` — they don't need this helper.
 */
export function readMentions(body: Record<string, unknown>): Mention[] {
  const value = body["mentions"];
  if (!Array.isArray(value)) return [];
  const out: Mention[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") continue;
    const r           = raw as Record<string, unknown>;
    const userId      = typeof r["user_id"] === "number" ? r["user_id"] : -1;
    const handle      = typeof r["handle"] === "string" ? r["handle"] : "";
    const displayName = typeof r["display_name"] === "string" ? r["display_name"] : "";
    const avatarUrl   = typeof r["avatar_url"] === "string" ? r["avatar_url"] : "";
    const range       = r["range"];
    if (
      userId <= 0 ||
      handle === "" ||
      displayName === "" ||
      !Array.isArray(range) ||
      range.length !== 2 ||
      typeof range[0] !== "number" ||
      typeof range[1] !== "number"
    ) {
      continue;
    }
    out.push({
      user_id: userId,
      handle,
      display_name: displayName,
      avatar_url: avatarUrl,
      range: [range[0], range[1]],
    });
  }
  return out;
}
