"use client";

/**
 * PostDetail — full-detail render of one FeedItem for the `/post/[id]`
 * permalink page. Same identity header, per-kind body, and reaction
 * surfaces as `FeedItemCard`, but the comment thread is permanently
 * expanded (`CommentDrawer isOpen`) instead of living behind a toggle —
 * this IS the comments surface, so there's nothing left to collapse.
 *
 * "use client" + `useFeedItem`: the server page fetches the post and
 * hands it in as `initialData`, but the view reads it back through a
 * React Query cache entry so Stoke (and future comment/reaction) patches
 * re-render the rail. Rendered off a plain server prop, the rail was
 * frozen — clicking Stoke updated the feed cache but never this view.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  BlogExcerptBody,
  GifBody,
  PhotoBody,
  ReviewBody,
} from "@/components/feed/FeedPostBody";
import { PageContextLine } from "@/components/feed/PageContextLine";
import { POST_KIND_LABELS, deriveBodySummary } from "@/components/feed/postBody";
import { useFeedItem } from "@/hooks/useFeed";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { PostOverflowMenu } from "@/components/feed/PostOverflowMenu";
import { ReactorStack } from "@/components/feed/ReactorStack";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { formatAbsoluteDateTime } from "@/lib/format";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

interface PostDetailProps {
  item: FeedItem;
  /** Same write-gate as FeedItemCard's `canInteract` — see its doc comment. */
  canInteract?: boolean;
  /**
   * Override the outer panel's classes. Defaults to the permalink page's
   * own look (rounded on every corner); kept as a prop so other surfaces
   * can reuse PostDetail with their own framing.
   */
  className?: string;
  /** Opens with the comment composer focused + scrolled into view. */
  focusComposer?: boolean;
}

export function PostDetail({
  item: initialItem,
  canInteract = true,
  // Mobile padding matches FeedItemCard's exactly (Item 7.3/9 — the detail
  // card read heavier than the feed at the same width); sm:+ keeps its
  // own slightly roomier detail-page sizing.
  className = "bcc-panel relative flex flex-col gap-3 p-3.5 pb-2.5 sm:p-5 sm:pb-3.5",
  focusComposer = false,
}: PostDetailProps) {
  // Reactive read seeded by the server fetch (initialData). Renders
  // instantly with no client fetch; mutations patch this cache so the
  // rail below reflects Stoke immediately instead of staying frozen.
  const item = useFeedItem(initialItem.id, initialItem).data;
  // H8: deleting removes the post from every cached feed and clears its
  // cache entry, but this view keeps rendering from the server-seeded
  // data, so the post stayed on screen with no word that it was gone.
  // Say so in place: works on the permalink page and in hosts that reuse
  // PostDetail inside a sheet, where a redirect would be wrong.
  const [deleted, setDeleted] = useState(false);
  // The menu that held focus is gone; land keyboard and screen-reader
  // users on the outcome instead of <body>. Once, when the state flips.
  const deletedHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (deleted) deletedHeadingRef.current?.focus();
  }, [deleted]);
  const kindLabel = POST_KIND_LABELS[item.post_kind] ?? item.post_kind.toUpperCase();
  const isReview  = item.post_kind === "review";
  const isBlog    = item.post_kind === "blog_excerpt";
  const isPhoto   = item.post_kind === "photo";
  const isGif     = item.post_kind === "gif";
  const summary   = isReview || isBlog || isPhoto || isGif ? "" : deriveBodySummary(item);

  const groupVerification = item.group?.verification ?? null;

  if (deleted) {
    return (
      <section className={className} aria-labelledby={`post-deleted-${item.id}`}>
        <div role="status" className="flex flex-col items-start gap-2 py-4">
          <h2
            id={`post-deleted-${item.id}`}
            tabIndex={-1}
            ref={deletedHeadingRef}
            className="bcc-stencil text-[15px] text-[var(--bcc-text)]"
          >
            Post deleted
          </h2>
          <p className="font-serif text-[14px] text-[var(--bcc-text-secondary)]">
            It has been removed everywhere it appeared.
          </p>
          <Link
            href="/"
            className="bcc-mono mt-1 inline-flex min-h-[44px] items-center text-[11px] tracking-[0.18em] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)] hover:underline"
          >
            BACK TO THE FLOOR →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <article className={className}>
      <header>
        <AuthorBadge
          author={item.author}
          size="md"
          avatarRingColor="var(--bcc-accent)"
          // The full author card already lives in the detail right rail —
          // no hover popover on the byline here (B7).
          hovercard={false}
          trailing={
            <div className="flex shrink-0 items-baseline gap-2">
              {/* "POSTED" adds nothing; keep action kinds only. */}
              {kindLabel !== "POSTED" && (
                <span
                  className="bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--bcc-text-secondary)]"
                  style={{ background: "var(--bcc-surface-active)" }}
                >
                  {kindLabel}
                </span>
              )}
              {groupVerification !== null && (
                <VerificationBadge
                  label={groupVerification.label}
                  className="bcc-mono shrink-0 text-[10px]"
                />
              )}
              <PostOverflowMenu
                selfHref={item.links.self}
                item={item}
                onDeleted={() => setDeleted(true)}
              />
            </div>
          }
        />
      </header>

      <PageContextLine context={item.page_context} />

      {isReview && <ReviewBody body={item.body} />}

      {isBlog && <BlogExcerptBody body={item.body} authorHandle={item.author.handle} />}

      {isPhoto && <PhotoBody item={item} />}

      {isGif && <GifBody item={item} />}

      {summary !== "" && (
        <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line break-words">
          {renderTextWithMentions(summary, readMentions(item.body))}
        </p>
      )}

      <ReactorStack social_proof={item.social_proof} />

      <PostActionBar
        item={item}
        canInteract={canInteract}
        commentCount={item.comment_count}
        onComment={() => {
          // Comments are always open below on the detail page — jump the
          // viewer to the composer rather than navigating anywhere.
          const el = document.getElementById(`comment-${item.id}`);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          (el as HTMLTextAreaElement | null)?.focus();
        }}
        commentTitle="Jump to the composer"
        shareTitle={`${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`}
        timestamp={item.posted_at}
        absoluteTitle={formatAbsoluteDateTime(item.posted_at)}
      />

      <CommentDrawer
        feedId={item.id}
        isOpen
        canInteract={canInteract}
        focusComposer={focusComposer}
      />
    </article>
  );
}
