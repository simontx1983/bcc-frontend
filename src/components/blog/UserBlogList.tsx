"use client";

/**
 * UserBlogList — paginated blog post list for /u/[handle]/blog.
 *
 * Reads from useUserBlog (cursor-paginated infinite query). Each
 * FeedItem comes back with body.excerpt + body.full_text already
 * populated by BlogService — this component renders the FULL body.
 *
 * No reactions, no inline composer — the blog tab is read-only in V1.
 * Posting happens through the Composer's Blog tab on the Floor.
 */

import { Fragment } from "react";

import { useUserBlog } from "@/hooks/useUserBlog";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

export function UserBlogList({ handle }: { handle: string }) {
  const query = useUserBlog(handle);

  if (query.isPending) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-ink-soft">Loading posts…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load posts: {query.error.message}
        </p>
      </div>
    );
  }

  const pages = query.data.pages;
  const totalCount = pages.reduce((sum, p) => sum + p.items.length, 0);

  if (totalCount === 0) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-ink-soft">
          No blog posts yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pages.map((page, pageIdx) => (
        <Fragment key={pageIdx}>
          {page.items.map((item) => (
            <BlogPostBody key={item.id} item={item} />
          ))}
        </Fragment>
      ))}

      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => { void query.fetchNextPage(); }}
          disabled={query.isFetchingNextPage}
          className={
            "bcc-mono mx-auto rounded-sm border-2 border-cardstock-edge px-5 py-2 text-[11px] tracking-[0.18em] text-ink-soft transition disabled:opacity-60 " +
            (query.isFetchingNextPage ? "" : "hover:border-ink hover:text-ink")
          }
        >
          {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BlogPostBody — full-body render. Contrast with FeedItemCard's
// BlogExcerptBody, which renders only the excerpt + a "read more" link.
// ─────────────────────────────────────────────────────────────────────

function BlogPostBody({ item }: { item: FeedItem }) {
  const excerpt = readString(item.body, "excerpt") ?? "";
  const fullText = readString(item.body, "full_text") ?? "";

  return (
    <article
      id={item.id}
      className="bcc-panel flex flex-col gap-4 px-6 py-6"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-cardstock-edge/40 pb-3">
        <div className="flex flex-col gap-1">
          <span className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft">
            PUBLISHED · @{item.author.handle}
          </span>
          {excerpt !== "" && (
            <p className="font-serif italic text-ink-soft">{excerpt}</p>
          )}
        </div>
        <time
          dateTime={item.posted_at}
          title={item.posted_at}
          className="bcc-mono shrink-0 text-[11px] text-ink-soft"
        >
          {formatRelativeTime(item.posted_at)}
        </time>
      </header>

      {fullText !== "" ? (
        <div className="font-serif text-ink whitespace-pre-line leading-relaxed">
          {fullText}
        </div>
      ) : (
        <p className="bcc-mono text-ink-soft">
          (Body unavailable.)
        </p>
      )}
    </article>
  );
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : null;
}
