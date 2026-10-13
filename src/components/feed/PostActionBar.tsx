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
import { PostHelpfulButton } from "@/components/feed/HelpfulButton";
import { hasEngagementControls } from "@/components/feed/postBody";
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
  topBorder = true,
}: {
  item: FeedItem;
  canInteract?: boolean;
  /**
   * Omit (or pass `undefined`) when the count is UNKNOWN — which is what
   * §4.32.15 produces for an announcement, whose feed projection emits no
   * count rather than the structurally-wrong activity count. The control
   * still renders; only the figure is withheld. Do not substitute 0: the
   * rendered result is identical, but 0 asserts "nobody replied".
   *
   * `| undefined` is explicit because `exactOptionalPropertyTypes` is on:
   * callers pass the field straight through, so the type has to admit the
   * omission rather than force every call site into a conditional spread.
   */
  commentCount?: number | undefined;
  onComment: () => void;
  commentTitle?: string;
  shareTitle?: string;
  /** ISO timestamp — rendered as a small muted clock+relative-time after Share. */
  timestamp?: string;
  absoluteTitle?: string;
  /**
   * Omit the rail's own top divider — for callers that already sit inside
   * a bordered wrapper (Lightbox's header/strip already draws that line),
   * where this bar's own border-t would show as a second, orphaned line
   * right above the icons. Defaults to true for every other surface
   * (FeedItemCard, PostDetail), where it's the only divider between the
   * post body and the rail.
   */
  topBorder?: boolean;
}) {
  // Contract §4.32.15. Keyed on the item's own kind and on NOTHING else —
  // never on whether the payload happens to carry `reactions`,
  // `helpful_count`, `viewer_has_marked` or the stoke fields, because the
  // point is to hold when a legacy or malformed payload carries them
  // populated. See `KINDS_WITHOUT_ENGAGEMENT` for why a reaction grammar
  // cannot express this and why the server half is not sufficient alone.
  const showEngagement = hasEngagementControls(item.post_kind);

  return (
    <footer className={"flex items-center gap-1" + (topBorder ? " border-t border-[var(--bcc-border)] pt-2" : "")}>
      {showEngagement && <ReactionRail item={item} canInteract={canInteract} />}
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
      {/* Divider — the "Mark helpful" endorsement is a different class of
          action from the cosmetic Stoke/Comment/Share cluster to its left,
          so it sits behind a thin rule to read as its own thing, not
          another reaction. It goes with the control: a kind that shows no
          Helpful button must not render an orphaned rule either. */}
      {showEngagement && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px self-center bg-[var(--bcc-border)]" />
          <PostHelpfulButton item={item} canInteract={canInteract} />
        </>
      )}
      {timestamp !== undefined && (
        <time
          dateTime={timestamp}
          title={absoluteTitle}
          className="bcc-mono inline-flex items-center gap-1 pl-1 text-[11px] text-[var(--bcc-text-secondary)]"
        >
          <ClockIcon />
          {formatRelativeTime(timestamp)}
        </time>
      )}
    </footer>
  );
}
