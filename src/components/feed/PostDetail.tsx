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

import {
  BlogExcerptBody,
  GifBody,
  PhotoBody,
  ReviewBody,
} from "@/components/feed/FeedPostBody";
import { POST_KIND_LABELS, deriveBodySummary } from "@/components/feed/postBody";
import { useFeedItem } from "@/hooks/useFeed";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { PostOverflowMenu } from "@/components/feed/PostOverflowMenu";
import { ReactionRail } from "@/components/feed/ReactionRail";
import { ReactorStack } from "@/components/feed/ReactorStack";
import { ShareButton } from "@/components/feed/ShareButton";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/format";
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
  className = "bcc-panel relative flex flex-col gap-3 p-4 sm:p-5",
  focusComposer = false,
}: PostDetailProps) {
  // Reactive read seeded by the server fetch (initialData). Renders
  // instantly with no client fetch; mutations patch this cache so the
  // rail below reflects Stoke immediately instead of staying frozen.
  const item = useFeedItem(initialItem.id, initialItem).data;
  const kindLabel = POST_KIND_LABELS[item.post_kind] ?? item.post_kind.toUpperCase();
  const isReview  = item.post_kind === "review";
  const isBlog    = item.post_kind === "blog_excerpt";
  const isPhoto   = item.post_kind === "photo";
  const isGif     = item.post_kind === "gif";
  const summary   = isReview || isBlog || isPhoto || isGif ? "" : deriveBodySummary(item);

  const groupVerification = item.group?.verification ?? null;

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
              <time
                dateTime={item.posted_at}
                title={formatAbsoluteDateTime(item.posted_at)}
                className="bcc-mono shrink-0 text-[11px] text-[var(--bcc-text-secondary)]/70"
              >
                {formatRelativeTime(item.posted_at)}
              </time>
              <PostOverflowMenu selfHref={item.links.self} item={item} />
            </div>
          }
        />
      </header>

      {isReview && <ReviewBody body={item.body} />}

      {isBlog && <BlogExcerptBody body={item.body} authorHandle={item.author.handle} />}

      {isPhoto && <PhotoBody item={item} />}

      {isGif && <GifBody item={item} />}

      {summary !== "" && (
        <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">
          {renderTextWithMentions(summary, readMentions(item.body))}
        </p>
      )}

      <ReactorStack social_proof={item.social_proof} />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bcc-border)] pt-2.5">
        <ReactionRail item={item} canInteract={canInteract} />
        <div className="flex shrink-0 items-center gap-3.5">
          <ShareButton
            selfHref={item.links.self}
            shareTitle={`${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`}
          />
        </div>
      </footer>

      <CommentDrawer
        feedId={item.id}
        isOpen
        canInteract={canInteract}
        focusComposer={focusComposer}
      />
    </article>
  );
}
