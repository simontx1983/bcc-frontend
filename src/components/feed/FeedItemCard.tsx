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
 */

import { memo, useCallback, useMemo } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import {
  BlogExcerptBody,
  GifBody,
  PhotoBody,
  ReviewBody,
} from "@/components/feed/FeedPostBody";
import { POST_KIND_LABELS, deriveBodySummary } from "@/components/feed/postBody";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { PostOverflowMenu } from "@/components/feed/PostOverflowMenu";
import { ReactorStack } from "@/components/feed/ReactorStack";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { formatAbsoluteDateTime } from "@/lib/format";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

function FeedItemCardImpl({
  item,
  canInteract = true,
}: {
  item: FeedItem;
  /**
   * Gates the WRITE affordances only. When false (§4.7.6 non-member
   * group teaser): the reaction rail's buttons are disabled and the
   * comment composer is suppressed — but reading existing comments and
   * seeing reaction counts stays available. Defaults to true so the
   * global feed, profile activity, and discover surfaces are unchanged.
   * A plain boolean keeps the memo() shallow-compare stable.
   */
  canInteract?: boolean;
}) {
  const router = useRouter();
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

  // Server-provided link — same `Route` cast pattern as CardFactory for
  // typedRoutes. Used by Share + the overflow menu's copy-link; the
  // permalink page `/post/[id]` is the hard-nav / SEO source of truth.
  const selfHref = item.links.self as Route;

  const commentCount = item.comment_count ?? 0;

  // Whole-card click soft-navigates to the post permalink (Reddit/Twitter
  // style — real URL change, native Back restores the feed's scroll from
  // React Query's cache). Any interactive descendant (avatar / author
  // links, mention links, the review/blog target link, photo/gif lightbox
  // button, reaction + footer buttons, overflow menu) opts out via
  // `closest("a, button")` so its own handler runs instead. The selection
  // check keeps highlighting body text from firing the navigation.
  const handleBodyClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(selfHref);
  };

  // Warm the permalink on hover so the click lands instantly (Twitter-fast
  // rather than Reddit-loady). Prefetch is idempotent and cheap.
  const prefetchSelf = useCallback(() => {
    router.prefetch(selfHref);
  }, [router, selfHref]);

  // Grouped secondary meta line (kind label · verification · timestamp ·
  // overflow) rendered in AuthorBadge's trailing slot, so the display
  // name reads clean on its own. Memoized: AuthorBadge is memo()'d, and
  // passing fresh inline JSX every render would silently defeat its
  // shallow-compare (perf-audit F4) — the same fix main applied, kept
  // here for the redesign's grouped layout.
  const trailing = useMemo(
    () => (
      <div className="flex shrink-0 items-baseline gap-2">
        {/* Kind chip — suppressed for plain posts ("POSTED" adds nothing);
            kept for action kinds (WATCHED, REVIEWED, DISPUTED, …). */}
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
        <PostOverflowMenu selfHref={selfHref} item={item} />
      </div>
    ),
    [kindLabel, groupVerification, selfHref, item]
  );

  return (
    <article
      onClick={handleBodyClick}
      onMouseEnter={prefetchSelf}
      className="bcc-panel relative flex cursor-pointer flex-col gap-3 p-3.5 pb-2.5 sm:p-4 sm:pb-3"
    >
      {/*
        Sprint 1 Identity Grammar — header is now <AuthorBadge>. Operator
        pill folds into AuthorBadge (driven by author.is_operator); kind
        label + verification badge + timestamp are grouped into the
        trailing slot as one secondary meta line, so the display name
        reads clean on its own.

        size="md" + the accent ring match the Composer's identity
        header so a viewer's own posting avatar and every author's feed
        avatar render at the same scale/treatment.
      */}
      <header>
        <AuthorBadge
          author={item.author}
          size="md"
          avatarRingColor="var(--bcc-accent)"
          trailing={trailing}
        />
      </header>

      <div className="flex flex-col gap-3">
        {isReview && <ReviewBody body={item.body} />}

        {isBlog && <BlogExcerptBody body={item.body} authorHandle={item.author.handle} />}

        {isPhoto && <PhotoBody item={item} />}

        {isGif && <GifBody item={item} />}

        {summary !== "" && (
          <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line break-words">
            {/*
              §3.3.12 — status bodies carry a `mentions[]` overlay.
              Other kinds (watch_batch, page_claim, dispute) emit a
              server-rendered string summary with no token wire format,
              so passing an empty mentions array renders the plain
              text unchanged.
            */}
            {renderTextWithMentions(summary, readMentions(item.body))}
          </p>
        )}

        <ReactorStack social_proof={item.social_proof} />
      </div>

      <PostActionBar
        item={item}
        canInteract={canInteract}
        commentCount={commentCount}
        onComment={() => router.push(`${selfHref}?intent=comment` as Route)}
        commentTitle="Open comments, focus the composer"
        shareTitle={`${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`}
        timestamp={item.posted_at}
        absoluteTitle={formatAbsoluteDateTime(item.posted_at)}
      />
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
