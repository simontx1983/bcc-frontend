"use client";

/**
 * FeedPostBody — per-kind body renderers shared by `FeedItemCard` (the
 * feed row) and `PostDetail` (the permalink + modal view). Hoisted out
 * of FeedItemCard so both surfaces render an identical post body
 * without duplicating the review/blog/photo/gif markup.
 *
 * "use client" — PhotoBody/GifBody own the Lightbox's open/closed
 * state. The other exports here have no state of their own; Next
 * renders them fine as client components inside PostDetail's server
 * tree.
 */

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";

import { Lightbox } from "@/components/ui/Lightbox";
import { readString } from "@/components/feed/postBody";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

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

export function ReviewBody({ body }: { body: Record<string, unknown> }) {
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
              background: "rgb(var(--ink-rgb) / 0.04)",
              border:     `1px solid ${tone.accent}`,
            }}
          >
            {tone.label}
          </span>
        )}
        {pageName !== "" && targetHref !== null && (
          <Link
            href={targetHref}
            className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)] hover:underline"
          >
            on {pageName}
          </Link>
        )}
        {pageName !== "" && targetHref === null && (
          <span className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">on {pageName}</span>
        )}
      </div>

      {text !== "" && <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">{text}</p>}
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

export function BlogExcerptBody({ body, authorHandle }: BlogExcerptBodyProps) {
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
              className="bcc-mono inline-flex items-center gap-1 border bg-[var(--bcc-surface-active)] px-2 py-1 text-[10px] tracking-[0.18em]"
              style={
                c.color !== null
                  ? { borderColor: c.color, color: c.color }
                  : { borderColor: "var(--bcc-border)", color: "var(--bcc-text-secondary)" }
              }
            >
              {c.name.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {title !== "" && (
        <h3 className="bcc-stencil text-lg text-[var(--bcc-text)] leading-tight sm:text-xl">
          {title}
        </h3>
      )}
      {excerpt !== "" && (
        <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">{excerpt}</p>
      )}
      {blogHref !== null && (
        <Link
          href={blogHref}
          className="bcc-mono self-start text-[11px] tracking-[0.18em] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)] hover:underline"
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

export function PhotoBody({ item }: { item: FeedItem }) {
  const body     = item.body;
  const caption  = readString(body, "caption") ?? "";
  const photoUrl = readString(body, "photo_url") ?? "";
  const mentions = readMentions(body);
  // Alt text is null in V1 per the contract (deferred a11y debt).
  // Fall back to "" so the <img> renders as decorative until alt
  // text collection ships.
  const alt = readString(body, "alt") ?? "";
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {caption !== "" && (
        <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">
          {renderTextWithMentions(caption, mentions)}
        </p>
      )}
      {photoUrl !== "" && (
        <>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full"
            aria-label={alt !== "" ? alt : "Open photo"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={alt}
              className="h-auto max-h-[480px] w-full rounded-xl border border-[var(--bcc-border)] object-cover"
              loading="lazy"
              decoding="async"
            />
          </button>
          {lightboxOpen && (
            <Lightbox item={item} src={photoUrl} alt={alt} onClose={() => setLightboxOpen(false)} />
          )}
        </>
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

export function GifBody({ item }: { item: FeedItem }) {
  const body    = item.body;
  const caption = readString(body, "caption") ?? "";
  const gifUrl  = readString(body, "gif_url") ?? "";
  const mentions = readMentions(body);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {caption !== "" && (
        <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">
          {renderTextWithMentions(caption, mentions)}
        </p>
      )}
      {gifUrl !== "" && (
        <>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full"
            aria-label="Open GIF"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gifUrl}
              alt=""
              className="h-auto max-h-[480px] w-full rounded-xl border border-[var(--bcc-border)] object-cover"
              loading="lazy"
              decoding="async"
            />
          </button>
          {lightboxOpen && (
            <Lightbox item={item} src={gifUrl} alt="" onClose={() => setLightboxOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}

