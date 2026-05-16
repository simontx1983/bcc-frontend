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
 * label mappings ("X started watching N cards"), not computed
 * state — they're reading body fields the server already populated.
 *
 * Future variants (deferred):
 *   - Embedded <CardFactory> when `attached_card` is present
 *   - Inline reaction rail (Solid / Vouch / Stand-behind buttons)
 *   - Click-through to the full post detail
 *   - Per-kind layouts: review with grade chip, dispute with status
 */

import { memo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { ReactionRail } from "@/components/feed/ReactionRail";
import { ReactorStack } from "@/components/feed/ReactorStack";
import { ReportButton } from "@/components/feed/ReportButton";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { formatRelativeTime } from "@/lib/format";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

const POST_KIND_LABELS: Record<string, string> = {
  status:        "POSTED",
  photo:         "POSTED",
  gif:           "POSTED",
  pull_batch:    "WATCHED",
  page_claim:    "CLAIMED",
  review:        "REVIEWED",
  dispute:       "DISPUTED",
  drop:          "DROPPED",
  release:       "RELEASED",
  signal:        "SIGNAL",
  blog_excerpt:  "PUBLISHED",
};

function FeedItemCardImpl({ item }: { item: FeedItem }) {
  const kindLabel = POST_KIND_LABELS[item.post_kind] ?? item.post_kind.toUpperCase();
  const isReview  = item.post_kind === "review";
  const isBlog    = item.post_kind === "blog_excerpt";
  const isPhoto   = item.post_kind === "photo";
  const isGif     = item.post_kind === "gif";
  // Status / fallback kinds use the generic body-summary derivation.
  // Review / blog / photo / gif have their own structured bodies that
  // render captions inline alongside the media, so we suppress the
  // generic summary line for those to avoid double-rendering caption
  // text.
  const summary   = isReview || isBlog || isPhoto || isGif ? "" : deriveBodySummary(item);

  // Group block (§3.3 v1.5): only on posts authored inside a PeepSo
  // group, and `verification` is null for non-NFT kinds.
  const groupVerification = item.group?.verification ?? null;

  // Server-provided links — same `Route` cast pattern as CardFactory
  // for typedRoutes.
  const selfHref = item.links.self as Route;

  // v1.5 comments — drawer is closed by default; opens on chip click.
  // Lazy-mount: the GET /comments request only fires when the drawer
  // opens, so feed cards stay light by default. Persisted per-card,
  // not globally, so navigating tabs preserves the open state.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentCount = item.comment_count ?? 0;

  return (
    <article className="bcc-panel relative flex flex-col gap-3 px-5 py-4">
      {/*
        Sprint 1 Identity Grammar — header is now <AuthorBadge>. Operator
        pill folds into AuthorBadge (driven by author.is_operator); kind
        label + verification badge ride as inline adornments; timestamp
        is the trailing slot. Identity now reads continuously into the
        comment drawer below (which uses the same AuthorBadge primitive).

        Sprint 1 known gap: FeedAuthor does NOT carry card_tier /
        tier_label / rank_label (types.ts:463-476). RankChip under the
        display name gracefully omits until backend extends FeedAuthor.
        See frontend-implementer report blocker for the contract
        extension this is waiting on.
      */}
      <header>
        <AuthorBadge
          author={item.author}
          inlineAdornments={
            <>
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
            </>
          }
          trailing={
            <time
              dateTime={item.posted_at}
              title={item.posted_at}
              className="bcc-mono shrink-0 text-[11px] text-ink-soft/70"
            >
              {formatRelativeTime(item.posted_at)}
            </time>
          }
        />
      </header>

      {isReview && <ReviewBody body={item.body} />}

      {isBlog && <BlogExcerptBody body={item.body} authorHandle={item.author.handle} />}

      {isPhoto && <PhotoBody body={item.body} />}

      {isGif && <GifBody body={item.body} />}

      {summary !== "" && (
        <p className="font-serif text-ink whitespace-pre-line">
          {/*
            §3.3.12 — status bodies carry a `mentions[]` overlay.
            Other kinds (pull_batch, page_claim, dispute) emit a
            server-rendered string summary with no token wire format,
            so passing an empty mentions array renders the plain
            text unchanged.
          */}
          {renderTextWithMentions(summary, readMentions(item.body))}
        </p>
      )}

      <ReactorStack social_proof={item.social_proof} />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-cardstock-edge/40 pt-2.5">
        <ReactionRail item={item} />
        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => setCommentsOpen((open) => !open)}
            aria-pressed={commentsOpen}
            aria-controls={`comments-${item.id}`}
            className="bcc-mono inline-flex min-h-[36px] items-center gap-1.5 text-[11px] text-ink-soft hover:text-ink"
            title={commentsOpen ? "Hide comments" : "Show comments"}
          >
            <span aria-hidden>💬</span>
            <span>{commentCount}</span>
          </button>
          <ReportButton item={item} />
          <Link
            href={selfHref}
            className="bcc-mono inline-flex min-h-[36px] items-center text-[11px] text-ink-soft hover:underline"
          >
            View →
          </Link>
        </div>
      </footer>
      <div id={`comments-${item.id}`}>
        <CommentDrawer feedId={item.id} isOpen={commentsOpen} />
      </div>
    </article>
  );
}

// Memoized at the export boundary — the feed list re-renders every
// time a sibling card mutates (reaction, comment drawer open). Stable
// `item` references should skip re-render. Memoization was previously
// absent on this surface; adding it as part of Sprint 1 Identity
// Grammar to keep the new AuthorBadge sub-tree from amplifying churn.
export const FeedItemCard = memo(FeedItemCardImpl);
FeedItemCard.displayName = "FeedItemCard";

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

const FEED_CATEGORY_LABELS: Record<string, string> = {
  news:     "News",
  analysis: "Analysis",
  guide:    "Guide",
  opinion:  "Opinion",
  tools:    "Tools",
  events:   "Events",
};

function BlogExcerptBody({ body, authorHandle }: BlogExcerptBodyProps) {
  const title    = readString(body, "title") ?? "";
  const excerpt  = readString(body, "excerpt") ?? "";
  const category = readString(body, "category");
  const chainTags = readBlogChainTags(body);
  // Server's body.author_handle wins when present (kept for future
  // cross-author renders); fall back to the FeedItem author handle.
  const handle = readString(body, "author_handle") ?? authorHandle;
  const blogHref =
    handle !== "" ? (`/u/${handle}?tab=blog` as Route) : null;

  return (
    <div className="flex flex-col gap-2">
      {(category !== null || chainTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {category !== null && (
            <span className="bcc-mono border border-safety/40 bg-safety/10 px-2 py-1 text-[10px] tracking-[0.18em] text-safety">
              {(FEED_CATEGORY_LABELS[category] ?? category).toUpperCase()}
            </span>
          )}
          {chainTags.map((c) => (
            <span
              key={c.slug}
              className="bcc-mono inline-flex items-center gap-1 border bg-cardstock-deep/10 px-2 py-1 text-[10px] tracking-[0.18em]"
              style={
                c.color !== null
                  ? { borderColor: c.color, color: c.color }
                  : { borderColor: "var(--cardstock-edge)", color: "var(--ink-soft)" }
              }
            >
              {c.name.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {title !== "" && (
        <h3 className="bcc-stencil text-lg text-ink leading-tight sm:text-xl">
          {title}
        </h3>
      )}
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

function readBlogChainTags(
  body: Record<string, unknown>
): Array<{ slug: string; name: string; color: string | null }> {
  const raw = body["chain_tags"];
  if (!Array.isArray(raw)) return [];
  const out: Array<{ slug: string; name: string; color: string | null }> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const slug = typeof obj["slug"] === "string" ? obj["slug"] : "";
    if (slug === "") continue;
    const name = typeof obj["name"] === "string" ? obj["name"] : slug;
    const color = typeof obj["color"] === "string" && obj["color"] !== "" ? obj["color"] : null;
    out.push({ slug, name, color });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Photo variant (v1.5) — caption (optional) above an inline image at
// the photo's natural aspect ratio. Click opens the native image in
// a new tab; lightbox / zoom is V2. The image is constrained by card
// width, capped at ~480px tall so a portrait photo doesn't stretch
// the feed row beyond reasonable scrollability.
//
// Per §A2 (no business logic on frontend), every visible field comes
// from the server view-model — `body.caption`, `body.photo_url`,
// `body.alt`. When `photo_url` is empty (S3-only deployment without
// fallback URL, or a race where save_images hasn't completed), the
// image is omitted gracefully and only the caption renders. The card
// stays a coherent post even in the degraded state.
// ─────────────────────────────────────────────────────────────────────

function PhotoBody({ body }: { body: Record<string, unknown> }) {
  const caption  = readString(body, "caption") ?? "";
  const photoUrl = readString(body, "photo_url") ?? "";
  const mentions = readMentions(body);
  // Alt text is null in V1 per the contract (deferred a11y debt).
  // Fall back to "" so the <img> renders as decorative until alt
  // text collection ships.
  const alt = readString(body, "alt") ?? "";

  return (
    <div className="flex flex-col gap-3">
      {caption !== "" && (
        <p className="font-serif text-ink whitespace-pre-line">
          {renderTextWithMentions(caption, mentions)}
        </p>
      )}
      {photoUrl !== "" && (
        <a
          href={photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block self-start"
          aria-label={alt !== "" ? alt : "Open photo in new tab"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={alt}
            className="max-h-[480px] max-w-full rounded-sm border border-cardstock-edge/30 object-contain"
            loading="lazy"
          />
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// GIF variant (v1.5) — caption (optional) above an inline GIF
// rendered directly from Giphy's CDN. Same layout shape as
// PhotoBody, different field name (`gif_url` vs `photo_url`) +
// no alt text concern (Giphy's image content is intentionally
// expressive, not informational; alt="" for decorative is correct
// per current a11y guidance for emoji-style media).
//
// Click opens the native GIF in a new tab. Lightbox / zoom is V2.
// Per Phase 1c product call, no per-card "via Giphy" attribution —
// attribution lives only inside the picker during selection.
// ─────────────────────────────────────────────────────────────────────

function GifBody({ body }: { body: Record<string, unknown> }) {
  const caption = readString(body, "caption") ?? "";
  const gifUrl  = readString(body, "gif_url") ?? "";
  const mentions = readMentions(body);

  return (
    <div className="flex flex-col gap-3">
      {caption !== "" && (
        <p className="font-serif text-ink whitespace-pre-line">
          {renderTextWithMentions(caption, mentions)}
        </p>
      )}
      {gifUrl !== "" && (
        <a
          href={gifUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block self-start"
          aria-label="Open GIF in new tab"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifUrl}
            alt=""
            className="max-h-[480px] max-w-full rounded-sm border border-cardstock-edge/30 object-contain"
            loading="lazy"
          />
        </a>
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

  if (item.post_kind === "watch_batch" || item.post_kind === "pull_batch") {
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

