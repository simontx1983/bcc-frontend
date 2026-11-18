/**
 * F-345 — read-only block for the reviewed party's ONE public reply to a
 * review. Rendered wherever the review renders: the received list (inside
 * ReviewReplySection), the written list (profile ReviewsPanel) and the
 * About REVIEWS preview (`compact`).
 *
 * Kept free of API and query imports so the read-only surfaces pay for
 * none of the write path. One reply, no thread: a reply takes no comments
 * and no reactions, so this block has no such affordance.
 */

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import type { ReviewReply } from "@/lib/api/types";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/format";

/**
 * Which colour family the host uses. Never crossed: the review panels are
 * fixed cream paper (`text-ink*`); the About card is the theme panel.
 */
export type ReplySurface = "paper" | "panel";

const TONE: Record<ReplySurface, { rule: string; body: string; meta: string }> = {
  paper: { rule: "border-ink/20", body: "text-ink", meta: "text-ink-ghost" },
  panel: { rule: "border-bcc-border", body: "text-bcc-text", meta: "text-bcc-text-secondary" },
};

export function ReviewReplyView({
  reply,
  surface,
  compact = false,
  notice,
  children,
}: {
  reply: ReviewReply;
  surface: ReplySurface;
  /** About preview: clamped body, no author link (the row is already a link). */
  compact?: boolean;
  /**
   * A status line above the body, and a dashed rule (ReviewReplySection's
   * "no longer shown on this page" marker on the viewer's stale reply).
   */
  notice?: string | undefined;
  /** Controls row (ReviewReplySection only). */
  children?: ReactNode;
}) {
  const tone = TONE[surface];
  const handle = `@${reply.author.handle.toUpperCase()}`;
  const stamp = reply.edited_at ?? reply.posted_at;
  const when = formatRelativeTime(stamp);
  const whenTitle = formatAbsoluteDateTime(stamp);
  // Compact sits inside the About row's <a><span>…</span></a>, where only
  // phrasing content is valid — so spans rendered as blocks there.
  const Box = compact ? "span" : "div";
  const Line = compact ? "span" : "p";

  return (
    <Box
      className={`mt-3 block border-l-2 pl-3 ${tone.rule} ${notice !== undefined ? "border-dashed" : ""}`}
      data-testid="review-reply"
    >
      <Line className={`block bcc-mono ${tone.meta}`} style={{ fontSize: "10px", letterSpacing: "0.16em" }}>
        REPLY FROM{" "}
        {compact ? (
          <span className="text-bcc-text-safety">{handle}</span>
        ) : (
          <Link
            href={`/u/${encodeURIComponent(reply.author.handle)}` as Route}
            className="text-bcc-text-safety hover:underline"
          >
            {handle}
          </Link>
        )}
        {when !== "" && (
          <>
            {" · "}
            <time dateTime={stamp} title={whenTitle !== "" ? whenTitle : undefined} suppressHydrationWarning>
              {reply.edited_at !== null ? `EDITED ${when}` : when}
            </time>
          </>
        )}
      </Line>
      {notice !== undefined && (
        <Line className={`mt-1 block bcc-mono ${tone.body}`} style={{ fontSize: "10px", letterSpacing: "0.16em" }}>
          {notice}
        </Line>
      )}
      <Line
        className={`mt-1 block whitespace-pre-line font-serif ${tone.body} ${compact ? "line-clamp-2" : ""}`}
        style={{ fontSize: "14px", lineHeight: 1.5 }}
      >
        {reply.body}
      </Line>
      {children}
    </Box>
  );
}
