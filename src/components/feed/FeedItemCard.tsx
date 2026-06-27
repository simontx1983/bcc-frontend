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

import { memo, useMemo } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BlogExcerptBody,
  GifBody,
  PhotoBody,
  POST_KIND_LABELS,
  ReviewBody,
  deriveBodySummary,
} from "@/components/feed/FeedPostBody";
import { PostOverflowMenu } from "@/components/feed/PostOverflowMenu";
import { ReactionRail } from "@/components/feed/ReactionRail";
import { ReactorStack } from "@/components/feed/ReactorStack";
import { ShareButton } from "@/components/feed/ShareButton";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { formatAbsoluteDateTime, formatRelativeTime } from "@/lib/format";
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

  // Server-provided links — same `Route` cast pattern as CardFactory
  // for typedRoutes.
  const selfHref = item.links.self as Route;

  const commentCount = item.comment_count ?? 0;

  // Whole-card click-to-navigate: any interactive descendant (avatar /
  // author links, mention links, the review/blog target link, photo/gif
  // new-tab anchor, reaction + footer buttons, overflow menu) opts out
  // by virtue of `closest("a, button")` — clicking it runs the native
  // link/button behavior instead of navigating to the post. The
  // selection check keeps highlighting body text from accidentally
  // firing a navigation.
  const handleBodyClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(selfHref);
  };

  // Grouped secondary meta line (kind label · verification · timestamp ·
  // overflow) rendered in AuthorBadge's trailing slot, so the display
  // name reads clean on its own. Memoized: AuthorBadge is memo()'d, and
  // passing fresh inline JSX every render would silently defeat its
  // shallow-compare (perf-audit F4) — the same fix main applied, kept
  // here for the redesign's grouped layout.
  const trailing = useMemo(
    () => (
      <div className="flex shrink-0 items-baseline gap-2">
        <span
          className="bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--bcc-text-secondary)]"
          style={{ background: "var(--bcc-surface-active)" }}
        >
          {kindLabel}
        </span>
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
        <PostOverflowMenu selfHref={selfHref} item={item} />
      </div>
    ),
    [kindLabel, groupVerification, selfHref, item]
  );

  return (
    <article
      onClick={handleBodyClick}
      className="bcc-panel relative flex cursor-pointer flex-col gap-3 p-3.5 sm:p-4"
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

        {isPhoto && <PhotoBody body={item.body} />}

        {isGif && <GifBody body={item.body} />}

        {summary !== "" && (
          <p className="font-serif text-[var(--bcc-text)] whitespace-pre-line">
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
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--bcc-border)] pt-2.5">
        <div className="flex items-center gap-1">
          <ActionPill active={item.reactions.viewer_has_stoked === true} tintColor="var(--bcc-secondary)">
            <ReactionRail item={item} canInteract={canInteract} />
          </ActionPill>
          <ActionPill>
            <Link
              href={selfHref}
              aria-label="View post and comments"
              className="bcc-mono inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-1.5 text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
              title="View post and comments"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{commentCount}</span>
            </Link>
          </ActionPill>
          <ActionPill>
            <ShareButton selfHref={selfHref} shareTitle={`${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`} />
          </ActionPill>
        </div>
        <Link
          href={selfHref}
          className="bcc-mono inline-flex min-h-[36px] shrink-0 items-center text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)] hover:underline"
        >
          View →
        </Link>
      </footer>
    </article>
  );
}

/**
 * Shared, very-subtle pill treatment so Stoke / Comment / Share read as
 * one quiet action row (X/Reddit-style) instead of a flame floating
 * away from a separate cluster. Transparent at rest; a faint surface
 * tint on hover; an even fainter color-tint when `active` (today, only
 * Stoke uses this — a stoked post's pill warms toward forge-orange).
 */
function ActionPill({
  children,
  active = false,
  tintColor,
}: {
  children: React.ReactNode;
  active?: boolean;
  tintColor?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-0.5 transition-colors duration-150 hover:bg-[var(--bcc-surface-active)]"
      style={
        active && tintColor !== undefined
          ? { backgroundColor: `color-mix(in srgb, ${tintColor} 14%, transparent)` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

// Memoized at the export boundary — the feed list re-renders every
// time a sibling card mutates (reaction, comment drawer open). Stable
// `item` references should skip re-render. Memoization was previously
// absent on this surface; adding it as part of Sprint 1 Identity
// Grammar to keep the new AuthorBadge sub-tree from amplifying churn.
export const FeedItemCard = memo(FeedItemCardImpl);
FeedItemCard.displayName = "FeedItemCard";
