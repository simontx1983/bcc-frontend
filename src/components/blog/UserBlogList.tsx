"use client";

/**
 * UserBlogList — paginated blog post list for the §D6 Blog tab.
 *
 * Each FeedItem comes back with the rich §D6 body shape (PR-A
 * hydrator):
 *   - title, excerpt, full_text  → headline + body
 *   - category                   → kicker badge
 *   - chain_tags[]               → chain chips with curated color
 *   - cover_image_url            → hero image when present
 *   - disclosure                 → fixed footer aside; "NO DISCLOSURES"
 *                                  rendered when omitted (explicit
 *                                  silence per the V1 trust posture)
 *
 * Body renders via BlogMarkdownRenderer (the shared crypto-aware
 * markdown pipeline), so the published surface and the composer
 * preview cannot drift.
 *
 * No reactions, no inline composer — the blog tab is read-only in V1.
 * Posting happens through the Blog tab CREATE sub-tab.
 */

import { Fragment } from "react";
import Image from "next/image";

import { useUserBlog } from "@/hooks/useUserBlog";
import { formatRelativeTime } from "@/lib/format";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode } from "@/lib/api/errors";
import type { FeedItem } from "@/lib/api/types";

import { BlogMarkdownRenderer } from "./markdown/BlogMarkdownRenderer";

const CATEGORY_LABELS: Record<string, string> = {
  news:     "News",
  analysis: "Analysis",
  guide:    "Guide",
  opinion:  "Opinion",
  tools:    "Tools",
  events:   "Events",
};

export interface UserBlogListProps {
  handle: string;
  /**
   * Owner-only edit affordance. When provided, each post renders an
   * "Edit" link in its header; clicking it fires this callback with
   * the full FeedItem (the parent — `BlogPanel` — uses it to switch
   * sub-tabs and hand the post body to the composer as
   * initialValues).
   *
   * Undefined for visitor views; the link is hidden.
   */
  onEdit?: (item: FeedItem) => void;
}

export function UserBlogList({ handle, onEdit }: UserBlogListProps) {
  const query = useUserBlog(handle);

  if (query.isPending) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-bcc-text-secondary">Loading posts…</p>
      </div>
    );
  }

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_unauthorized: "Sign in to read these posts.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "Posts are temporarily unavailable. Try again shortly.",
    },
    "Couldn't load posts. Try again in a moment.",
  );

  const pages = query.data?.pages ?? [];
  const totalCount = pages.reduce((sum, p) => sum + p.items.length, 0);

  // Three distinct failure states, mutually exclusive by construction.
  // TanStack computes `isLoadingError = isError && !hasData`, and for an
  // infinite query narrows `isRefetchError` to
  // `isError && hasData && !isFetchNextPageError && !isFetchPreviousPageError`.
  // Collapsing them into a bare `isError` — as this file used to — makes
  // Retry dishonest: a failed *refresh* would be retried by advancing the
  // cursor, and LOAD MORE would be withdrawn for a cursor that never
  // failed. Same split as PhotosPanel.
  //
  //   isLoadingError       — the FIRST fetch failed; nothing is retained,
  //                          so the whole panel is the failure. Retry
  //                          re-issues the initial read via refetch().
  //   isRefetchError       — a REFRESH of already-loaded pages failed.
  //                          Posts stay on screen; LOAD MORE stays too,
  //                          because the retained last page's next cursor
  //                          is untouched by a failed refresh.
  //   isFetchNextPageError — a LOAD MORE failed. Posts stay; ordinary
  //                          LOAD MORE is withdrawn so the failed cursor
  //                          cannot be skipped, and Retry resumes at that
  //                          same cursor via fetchNextPage().
  if (query.isLoadingError) {
    return (
      <div className="bcc-panel p-6">
        <LoadFailure message={failureCopy} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  // Success-only empty state. A failed refresh of an empty list must
  // report the failure, not claim "nothing here" — so this is gated on
  // there being no error at all, not merely on `isLoadingError`.
  if (totalCount === 0 && !query.isError) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-bcc-text-secondary">
          No blog posts yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {pages.map((page, pageIdx) => (
        <Fragment key={pageIdx}>
          {page.items.map((item) => (
            <BlogPostBody
              key={item.id}
              item={item}
              {...(onEdit !== undefined ? { onEdit } : {})}
            />
          ))}
        </Fragment>
      ))}

      {/* A failed REFRESH reports itself beneath the posts that did load,
          rather than replacing them. Retry re-runs the refresh; LOAD MORE
          below stays available because the retained last page still holds
          a safe next cursor. */}
      {query.isRefetchError && (
        <LoadFailure message={failureCopy} onRetry={() => void query.refetch()} />
      )}

      {/* A failed LOAD MORE takes the place of the LOAD MORE control, so
          the cursor that failed cannot be skipped past. Retry resumes at
          that same cursor instead of refetching the whole list. */}
      {query.isFetchNextPageError ? (
        <LoadFailure message={failureCopy} onRetry={() => void query.fetchNextPage()} />
      ) : (
        query.hasNextPage && (
          <button
            type="button"
            onClick={() => { void query.fetchNextPage(); }}
            disabled={query.isFetchingNextPage}
            className={
              "bcc-mono mx-auto rounded-sm border-2 border-bcc-border px-5 py-2 text-[11px] tracking-[0.18em] text-bcc-text-secondary transition disabled:opacity-60 " +
              (query.isFetchingNextPage ? "" : "hover:border-bcc-border-strong hover:text-bcc-text")
            }
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BlogPostBody — full-body render with §D6 rich fields.
// ─────────────────────────────────────────────────────────────────────

interface BlogPostBodyProps {
  item: FeedItem;
  /** Owner-only edit affordance — undefined for visitor views. */
  onEdit?: (item: FeedItem) => void;
}

function BlogPostBody({ item, onEdit }: BlogPostBodyProps) {
  const title    = readString(item.body, "title") ?? "";
  const excerpt  = readString(item.body, "excerpt") ?? "";
  const fullText = readString(item.body, "full_text") ?? "";
  const category = readString(item.body, "category");
  const coverUrl = readString(item.body, "cover_image_url");
  const chainTags = readChainTags(item.body);
  const disclosure = readDisclosure(item.body);
  const sources = readSources(item.body);

  return (
    <article id={item.id} className="bcc-panel flex flex-col gap-5 px-6 py-6">
      {coverUrl !== null && (
        <div className="relative -mx-6 -mt-6 mb-2 aspect-[16/9] overflow-hidden bg-bcc-surface-hover">
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      <header className="flex flex-col gap-2 border-b border-bcc-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {category !== null && (
            <span className="bcc-mono border border-safety/40 bg-safety/10 px-2 py-1 text-[10px] tracking-[0.18em] text-safety">
              {(CATEGORY_LABELS[category] ?? category).toUpperCase()}
            </span>
          )}
          {chainTags.map((c) => (
            <span
              key={c.slug}
              className="bcc-mono inline-flex items-center gap-1 border border-bcc-border bg-bcc-surface-hover px-2 py-1 text-[10px] tracking-[0.18em] text-bcc-text"
              style={c.color !== null ? { borderColor: c.color, color: c.color } : { borderColor: "var(--bcc-border)", color: "var(--bcc-text-secondary)" }}
            >
              {c.name.toUpperCase()}
            </span>
          ))}
        </div>

        {title !== "" && (
          <h2 className="bcc-stencil text-2xl text-bcc-text leading-tight sm:text-3xl">
            {title}
          </h2>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
            @{item.author.handle}
          </span>
          <div className="flex items-baseline gap-3">
            {onEdit !== undefined && (
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="bcc-mono text-[10px] tracking-[0.18em] text-safety hover:underline underline-offset-4"
              >
                EDIT
              </button>
            )}
            <time
              dateTime={item.posted_at}
              title={item.posted_at}
              className="bcc-mono shrink-0 text-[11px] text-bcc-text-secondary"
            >
              {formatRelativeTime(item.posted_at)}
            </time>
          </div>
        </div>

        {excerpt !== "" && (
          <p className="font-serif italic text-bcc-text-secondary">{excerpt}</p>
        )}
      </header>

      {fullText !== "" ? (
        <BlogMarkdownRenderer body={fullText} />
      ) : (
        <p className="bcc-mono text-bcc-text-secondary">
          (Body unavailable.)
        </p>
      )}

      {sources.length > 0 && (
        <section
          aria-label="Sources"
          className="border-t border-dashed border-bcc-border pt-3"
        >
          <p className="bcc-mono mb-2 text-[10px] tracking-[0.18em] text-bcc-text-secondary">
            SOURCES
          </p>
          <ol className="flex flex-col gap-1 text-[12px] text-bcc-text-secondary">
            {sources.map((src, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="bcc-mono shrink-0 tabular-nums text-bcc-text-secondary/70">
                  {idx + 1}.
                </span>
                <SourceEntry value={src} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="border-t border-dashed border-bcc-border pt-3">
        <DisclosureFooter disclosure={disclosure} />
      </footer>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DisclosureFooter — fixed footer aside per §D6 trust posture.
// Empty disclosure renders "NO DISCLOSURES" — explicit silence is
// itself information.
// ─────────────────────────────────────────────────────────────────────

function DisclosureFooter({ disclosure }: { disclosure: { tickers: string[]; note: string } | null }) {
  if (
    disclosure === null ||
    (disclosure.tickers.length === 0 && disclosure.note.trim() === "")
  ) {
    return (
      <p className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
        NO DISCLOSURES
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary">
        DISCLOSURE
      </p>
      {disclosure.tickers.length > 0 && (
        <p className="bcc-mono text-[11px] text-bcc-text">
          {disclosure.tickers.join(" · ")}
        </p>
      )}
      {disclosure.note.trim() !== "" && (
        <p className="font-serif text-sm text-bcc-text">{disclosure.note}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body-shape readers — defensive narrowing so a partial server payload
// (or a pre-PR-A blog post that lacks the new fields) renders cleanly.
// ─────────────────────────────────────────────────────────────────────

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function readChainTags(
  body: Record<string, unknown>
): Array<{ slug: string; name: string; color: string | null }> {
  const raw = body["chain_tags"];
  if (!Array.isArray(raw)) return [];
  const out: Array<{ slug: string; name: string; color: string | null }> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const slug = typeof obj["slug"] === "string" ? obj["slug"] : "";
    const name = typeof obj["name"] === "string" ? obj["name"] : slug;
    if (slug === "") continue;
    const color = typeof obj["color"] === "string" && obj["color"] !== "" ? obj["color"] : null;
    out.push({ slug, name, color });
  }
  return out;
}

function readDisclosure(body: Record<string, unknown>): { tickers: string[]; note: string } | null {
  const raw = body["disclosure"];
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const tickersRaw = obj["tickers"];
  const tickers = Array.isArray(tickersRaw)
    ? tickersRaw.filter((t): t is string => typeof t === "string")
    : [];
  const note = typeof obj["note"] === "string" ? obj["note"] : "";
  return { tickers, note };
}

function readSources(body: Record<string, unknown>): string[] {
  const raw = body["sources"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s !== "");
}

// ─────────────────────────────────────────────────────────────────────
// SourceEntry — renders a single source string. URLs become external
// links; everything else renders as plain text. We only auto-link
// http(s) so an author can't smuggle javascript: or data: URIs
// through the citation slot.
// ─────────────────────────────────────────────────────────────────────

function SourceEntry({ value }: { value: string }) {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all text-blueprint hover:underline underline-offset-2"
      >
        {trimmed}
      </a>
    );
  }
  return <span className="break-words">{trimmed}</span>;
}