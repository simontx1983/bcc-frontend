"use client";

/**
 * FeedItemCard — polymorphic renderer for one feed row.
 *
 * V1 strategy: ONE layout, kind-tinted summary line at top, body text
 * derived per post_kind. Every kind uses the same shell so the feed
 * looks coherent and rows that don't have a custom variant yet still
 * render gracefully.
 *
 * Per §A2 (no business logic), every visible field comes from the
 * server's view-model. The per-kind summaries are mechanical
 * label mappings ("X added N cards to their binder"), not computed
 * state — they're reading body fields the server already populated.
 *
 * Future variants (deferred):
 *   - Embedded <CardFactory> when `attached_card` is present
 *   - Inline reaction rail (Solid / Vouch / Stand-behind buttons)
 *   - Click-through to the full post detail
 *   - Per-kind layouts: review with grade chip, dispute with status
 */

import type { Route } from "next";
import Link from "next/link";

import { ReactionRail } from "@/components/feed/ReactionRail";
import { ReportButton } from "@/components/feed/ReportButton";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

const POST_KIND_LABELS: Record<string, string> = {
  status:        "POSTED",
  pull_batch:    "WATCHED",
  page_claim:    "CLAIMED",
  review:        "REVIEWED",
  dispute:       "DISPUTED",
  drop:          "DROPPED",
  release:       "RELEASED",
  signal:        "SIGNAL",
  blog_excerpt:  "PUBLISHED",
};

export function FeedItemCard({ item }: { item: FeedItem }) {
  const kindLabel = POST_KIND_LABELS[item.post_kind] ?? item.post_kind.toUpperCase();
  const isReview  = item.post_kind === "review";
  const isBlog    = item.post_kind === "blog_excerpt";
  const summary   = isReview || isBlog ? "" : deriveBodySummary(item);

  // Group block (§3.3 v1.5): only on posts authored inside a PeepSo
  // group, and `verification` is null for non-NFT kinds.
  const groupVerification = item.group?.verification ?? null;

  // Server-provided links — same `Route` cast pattern as CardFactory
  // for typedRoutes.
  const selfHref   = item.links.self as Route;
  const authorHref = item.links.author === "" ? null : (item.links.author as Route);

  return (
    <article className="bcc-panel relative flex flex-col gap-3 px-5 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 truncate">
          {authorHref !== null ? (
            <Link href={authorHref} className="bcc-stencil truncate text-ink hover:underline">
              {item.author.display_name ?? `@${item.author.handle}`}
            </Link>
          ) : (
            <span className="bcc-stencil truncate text-ink">
              {item.author.display_name ?? `@${item.author.handle}`}
            </span>
          )}
          {item.author.is_operator === true && (
            <span
              className="bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-[0.18em]"
              style={{
                color:      "var(--verified)",
                background: "rgba(44,157,102,0.10)",
                border:     "1px solid rgba(44,157,102,0.40)",
              }}
              title="Verified operator/creator on at least one entity."
            >
              OPERATOR
            </span>
          )}
          <span
            className="bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: "rgba(15,13,9,0.06)", color: "var(--ink-soft)" }}
          >
            {kindLabel}
          </span>
          {groupVerification !== null && (
            <VerificationBadge
              label={groupVerification.label}
              className="bcc-mono shrink-0 text-[10px]"
            />
          )}
        </div>
        <time
          dateTime={item.posted_at}
          title={item.posted_at}
          className="bcc-mono shrink-0 text-[11px] text-ink-soft/70"
        >
          {formatRelativeTime(item.posted_at)}
        </time>
      </header>

      {isReview && <ReviewBody body={item.body} />}

      {isBlog && <BlogExcerptBody body={item.body} authorHandle={item.author.handle} />}

      {summary !== "" && (
        <p className="font-serif text-ink">{summary}</p>
      )}

      {item.social_proof?.headline !== undefined && item.social_proof.headline !== null && (
        <p className="bcc-mono text-[11px] text-ink-soft/80">{item.social_proof.headline}</p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cardstock-edge/40 pt-2.5">
        <ReactionRail item={item} />
        <div className="flex shrink-0 items-center gap-4">
          <ReportButton item={item} />
          <Link
            href={selfHref}
            className="bcc-mono inline-flex min-h-[36px] items-center text-[11px] text-ink-soft hover:underline"
          >
            View →
          </Link>
        </div>
      </footer>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Review variant — grade chip + target page link + body text.
// Mirrors the review composer's grade tones (Trust/Neutral/Caution).
// ─────────────────────────────────────────────────────────────────────

const REVIEW_GRADE_LABELS: Record<string, { label: string; accent: string }> = {
  trust:   { label: "TRUST",   accent: "var(--verified)" },
  neutral: { label: "NEUTRAL", accent: "var(--blueprint)" },
  caution: { label: "CAUTION", accent: "var(--safety)" },
};

/** card_kind → entity-route prefix. Mirrors CardUrlMap on the server. */
const REVIEW_KIND_PREFIX: Record<string, string> = {
  validator: "/v",
  project:   "/p",
  creator:   "/c",
};

function ReviewBody({ body }: { body: Record<string, unknown> }) {
  const grade      = readString(body, "grade") ?? "";
  const text       = readString(body, "text") ?? "";
  const pageHandle = readString(body, "page_handle") ?? "";
  const pageName   = readString(body, "page_name") ?? "";
  const pageKind   = readString(body, "page_kind") ?? "";

  const tone = REVIEW_GRADE_LABELS[grade];
  // Server pre-resolves the entity kind so reviews of projects /
  // creators don't 404 by linking to /v/. Empty kind = unresolved
  // page; we suppress the link rather than guess.
  const prefix = REVIEW_KIND_PREFIX[pageKind];
  const targetHref =
    pageHandle !== "" && prefix !== undefined
      ? (`${prefix}/${pageHandle}` as Route)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        {tone !== undefined && (
          <span
            className="bcc-mono rounded-sm px-2 py-0.5 text-[10px] tracking-[0.18em]"
            style={{
              color:      tone.accent,
              background: "rgba(15,13,9,0.04)",
              border:     `1px solid ${tone.accent}`,
            }}
          >
            {tone.label}
          </span>
        )}
        {pageName !== "" && targetHref !== null && (
          <Link
            href={targetHref}
            className="bcc-mono text-[11px] text-ink-soft hover:text-ink hover:underline"
          >
            on {pageName}
          </Link>
        )}
        {pageName !== "" && targetHref === null && (
          <span className="bcc-mono text-[11px] text-ink-soft">on {pageName}</span>
        )}
      </div>

      {text !== "" && <p className="font-serif text-ink whitespace-pre-line">{text}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Blog excerpt variant — Floor context. Server hydrates body.excerpt
// only (full_text is null on Floor). The "Read full post" affordance
// links to the author's blog tab; deep-linking to the individual post
// is V1.5 work.
// ─────────────────────────────────────────────────────────────────────

interface BlogExcerptBodyProps {
  body: Record<string, unknown>;
  authorHandle: string;
}

function BlogExcerptBody({ body, authorHandle }: BlogExcerptBodyProps) {
  const excerpt = readString(body, "excerpt") ?? "";
  // Server's body.author_handle wins when present (kept for future
  // cross-author renders); fall back to the FeedItem author handle.
  const handle = readString(body, "author_handle") ?? authorHandle;
  const blogHref =
    handle !== "" ? (`/u/${handle}/blog` as Route) : null;

  return (
    <div className="flex flex-col gap-2">
      {excerpt !== "" && (
        <p className="font-serif text-ink whitespace-pre-line">{excerpt}</p>
      )}
      {blogHref !== null && (
        <Link
          href={blogHref}
          className="bcc-mono self-start text-[11px] tracking-[0.18em] text-ink-soft hover:text-ink hover:underline"
        >
          READ FULL POST →
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-kind body → summary text. Reads body fields the server wrote;
// fallback is the post_kind label so unknown kinds still render.
// ─────────────────────────────────────────────────────────────────────

function deriveBodySummary(item: FeedItem): string {
  const body = item.body;

  if (item.post_kind === "status") {
    return readString(body, "text") ?? "";
  }

  if (item.post_kind === "pull_batch") {
    const cardCount = readNumber(body, "card_count") ?? 0;
    const moreCount = readNumber(body, "more_count") ?? 0;
    if (cardCount === 0) return "";
    const noun = cardCount === 1 ? "card" : "cards";
    if (moreCount > 0) {
      return `Added ${cardCount} ${noun} to their binder (+${moreCount} more).`;
    }
    return `Added ${cardCount} ${noun} to their binder.`;
  }

  // page_claim's summary is server-rendered (§A2). When the backend
  // ships a body.summary/body.text field for claim posts, the generic
  // fallback below picks it up; until then claim items render with
  // just the kind label + author.

  // Review + blog_excerpt have dedicated body renderers above —
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

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function readNumber(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  return typeof value === "number" ? value : null;
}

