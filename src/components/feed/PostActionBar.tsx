"use client";

/**
 * PostActionBar — the shared Stoke / Comment / Share action row used by
 * both FeedItemCard and PostDetail so the two surfaces stay identical.
 *
 * The three pills sit tight at the left (X/Reddit-style quiet action
 * row). The comment action differs per surface — navigate to the
 * permalink on a feed card, focus the always-open composer on the detail
 * page — so it arrives as an `onComment` callback.
 */

import type { ReactNode } from "react";

import { ReactionRail } from "@/components/feed/ReactionRail";
import { ShareButton } from "@/components/feed/ShareButton";
import type { FeedItem } from "@/lib/api/types";

export function PostActionBar({
  item,
  canInteract = true,
  commentCount,
  onComment,
  commentTitle = "Comments",
  shareTitle,
}: {
  item: FeedItem;
  canInteract?: boolean;
  commentCount: number;
  onComment: () => void;
  commentTitle?: string;
  shareTitle?: string;
}) {
  return (
    <footer className="flex items-center gap-1 border-t border-[var(--bcc-border)] pt-2.5">
      <ActionPill active={item.reactions.viewer_has_stoked === true} tintColor="var(--bcc-secondary)">
        <ReactionRail item={item} canInteract={canInteract} />
      </ActionPill>
      <ActionPill>
        <button
          type="button"
          onClick={onComment}
          aria-label={commentTitle}
          title={commentTitle}
          className="group bcc-mono inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-1.5 text-[12px] text-[var(--bcc-text-secondary)]"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="text-[var(--bcc-info)] transition-transform duration-150 group-hover:-translate-y-0.5"
          >
            <path
              d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          <span>{commentCount}</span>
        </button>
      </ActionPill>
      <ActionPill>
        <ShareButton
          selfHref={item.links.self}
          {...(shareTitle !== undefined ? { shareTitle } : {})}
        />
      </ActionPill>
    </footer>
  );
}

/**
 * Very-subtle pill treatment so Stoke / Comment / Share read as one quiet
 * action row (X/Reddit-style). Transparent at rest; a faint surface tint
 * on hover; an even fainter color-tint when `active` (today only Stoke
 * uses it — a stoked post's pill warms toward forge-orange).
 */
export function ActionPill({
  children,
  active = false,
  tintColor,
}: {
  children: ReactNode;
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
