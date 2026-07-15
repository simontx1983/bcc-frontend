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

import { ActionRailButton } from "@/components/feed/ActionRailButton";
import { ClockIcon, ReplyIcon } from "@/components/feed/actionIcons";
import { ReactionRail } from "@/components/feed/ReactionRail";
import { ShareButton } from "@/components/feed/ShareButton";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

export function PostActionBar({
  item,
  canInteract = true,
  commentCount,
  onComment,
  commentTitle = "Comments",
  shareTitle,
  timestamp,
  absoluteTitle,
}: {
  item: FeedItem;
  canInteract?: boolean;
  commentCount: number;
  onComment: () => void;
  commentTitle?: string;
  shareTitle?: string;
  /** ISO timestamp — rendered as a small muted clock+relative-time after Share. */
  timestamp?: string;
  absoluteTitle?: string;
}) {
  return (
    <footer className="flex items-center gap-1 border-t border-[var(--bcc-border)] pt-2">
      <ReactionRail item={item} canInteract={canInteract} />
      <ActionRailButton
        icon={<ReplyIcon />}
        label="Comment"
        count={commentCount}
        hoverClassName="hover:text-[var(--bcc-info)]"
        onClick={onComment}
        ariaLabel={commentTitle}
      />
      <ShareButton
        selfHref={item.links.self}
        {...(shareTitle !== undefined ? { shareTitle } : {})}
      />
      {timestamp !== undefined && (
        <time
          dateTime={timestamp}
          title={absoluteTitle}
          className="bcc-mono inline-flex items-center gap-1 pl-1 text-[11px] text-[var(--bcc-text-muted)]"
        >
          <ClockIcon />
          {formatRelativeTime(timestamp)}
        </time>
      )}
    </footer>
  );
}
