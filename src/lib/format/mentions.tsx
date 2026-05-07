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

import type { Mention } from "@/lib/api/types";

export function renderTextWithMentions(
  text: string,
  mentions: Mention[]
): ReactNode {
  if (text === "") return null;
  if (mentions.length === 0) return text;

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
          {text.substring(cursor, start)}
        </Fragment>
      );
    }
    out.push(
      <Link
        key={`m-${key++}-${m.user_id}`}
        href={`/u/${m.handle}` as Route}
        className="text-blueprint hover:underline"
      >
        @{m.display_name}
      </Link>
    );
    cursor = end;
  }
  if (cursor < text.length) {
    out.push(
      <Fragment key={`t-${key++}`}>{text.substring(cursor)}</Fragment>
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
