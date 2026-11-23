/**
 * F-345 — read-only block for the reviewed party's ONE public reply to a
 * review. Rendered wherever the review renders: the received list (inside
 * ReviewReplySection), the written list (profile ReviewsPanel) and the
 * About REVIEWS preview (`compact`).
 *
 * Kept free of API and query imports so the read-only surfaces pay for
 * none of the write path.
 *
 * A page-attributed reply (`author_kind: "page"`) shows the page's name
 * and crest and links the page, never person fields. A stale reply
 * (v1.174, the viewer's own after a hand-over) says it isn't public. One reply, no thread: a reply takes no comments
 * and no reactions, so this block has no such affordance.
 */

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Avatar } from "@/components/identity/Avatar";
import type { ReviewReply, ReviewReplyPageAuthor } from "@/lib/api/types";
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

/**
 * A page links like any card: by card_kind + handle (the card routes).
 * null for a kind this build doesn't know, so the name renders unlinked.
 */
const PAGE_ROUTE_PREFIX: Record<ReviewReplyPageAuthor["card_kind"], string> = {
  validator: "/v/",
  project: "/p/",
  creator: "/c/",
};

export function pageReplyHref(page: ReviewReplyPageAuthor): string | null {
  const prefix = (PAGE_ROUTE_PREFIX as Partial<Record<string, string>>)[page.card_kind];
  return prefix === undefined || page.handle === "" ? null : `${prefix}${encodeURIComponent(page.handle)}`;
}

export function ReviewReplyView({
  reply,
  surface,
  compact = false,
  stale = false,
  children,
}: {
  reply: ReviewReply;
  surface: ReplySurface;
  /** About preview: clamped body, no author link (the row is already a link). */
  compact?: boolean;
  /** v1.174: the viewer's own reply after the page changed hands. */
  stale?: boolean;
  /** Controls row (ReviewReplySection only). */
  children?: ReactNode;
}) {
  const tone = TONE[surface];
  const from =
    reply.author_kind === "page"
      ? { label: reply.page.name, href: pageReplyHref(reply.page), page: reply.page }
      : {
          label: `@${reply.author.handle.toUpperCase()}`,
          href: `/u/${encodeURIComponent(reply.author.handle)}`,
          page: null,
        };
  const stamp = reply.edited_at ?? reply.posted_at;
  const when = formatRelativeTime(stamp);
  const whenTitle = formatAbsoluteDateTime(stamp);
  // Compact sits inside the About row's <a><span>…</span></a>, where only
  // phrasing content is valid — so spans rendered as blocks there.
  const Box = compact ? "span" : "div";
  const Line = compact ? "span" : "p";

  return (
    <Box className={`mt-3 block border-l-2 pl-3 ${tone.rule}`} data-testid="review-reply">
      <Line className={`block bcc-mono ${tone.meta}`} style={{ fontSize: "10px", letterSpacing: "0.16em" }}>
        {stale ? "YOUR EARLIER REPLY · NO LONGER SHOWN PUBLICLY" : "REPLY FROM"}
        {!stale && (
          <>
            {" "}
            {from.page !== null && (
              <Avatar
                avatarUrl={from.page.avatar_url !== "" ? from.page.avatar_url : null}
                handle={from.page.handle}
                displayName={from.page.name}
                size="xs"
                className="mr-1 inline-block align-middle"
              />
            )}
            {compact || from.href === null ? (
              <span className="text-bcc-text-safety">{from.label}</span>
            ) : (
              <Link href={from.href as Route} className="text-bcc-text-safety hover:underline">
                {from.label}
              </Link>
            )}
          </>
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
