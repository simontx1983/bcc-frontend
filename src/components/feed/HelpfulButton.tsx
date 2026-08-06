"use client";

/**
 * "Mark helpful" control (§9.2) — a deliberate endorsement of genuinely
 * useful content, rendered as a sibling of, but visually distinct from,
 * the Stoke/reaction controls. It is NOT a like: different icon (a
 * helping hand, never a heart/thumb), its own info-blue active color
 * (Stoke is forge-orange), and it sits behind a thin divider so it reads
 * as a separate class of action rather than "one more reaction."
 *
 * Two thin wrappers (post + comment) share one presentational view, the
 * same way ReactionRail and the comment stoke button share StokeFlame.
 * Each wrapper reads its row's optional `helpful_count`/`viewer_has_marked`
 * (absent on a backend that doesn't hydrate them yet → a neutral unmarked
 * state) and drives the toggle via the matching mutation hook, which
 * supplies the server truth. A 404/error rolls back inside the hook and
 * the control simply returns to its prior state — no crash, no noise.
 *
 * Rest state matches the neighbouring rail buttons (neutral secondary
 * text); active state fills the pill with a faint info tint + a bolder,
 * filled icon. Motion is a single reduced-motion-gated scale nudge on the
 * icon when marked; with reduced motion the active state is fully static.
 */

import { memo, useCallback, type CSSProperties, type MouseEvent } from "react";

import { HelpfulIcon } from "@/components/feed/actionIcons";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMarkHelpful, useMarkHelpfulComment } from "@/hooks/useMarkHelpful";
import type { Comment, FeedItem } from "@/lib/api/types";

type HelpfulSize = "feed" | "comment";

interface HelpfulButtonViewProps {
  marked: boolean;
  count: number;
  disabled: boolean;
  size: HelpfulSize;
  onToggle: () => void;
}

/**
 * Presentational only — owns look + a11y + reduced-motion, never any
 * data/mutation. Memoized because it renders once per feed card and once
 * per comment row.
 */
const HelpfulButtonView = memo(function HelpfulButtonView({
  marked,
  count,
  disabled,
  size,
  onToggle,
}: HelpfulButtonViewProps) {
  const reduced = usePrefersReducedMotion();

  // Endorsement copy — state-descriptive, no cadence-pressure nudging.
  const label = marked ? "You marked this helpful" : "Mark this as helpful";
  const iconSize = size === "feed" ? 17 : 15;
  const minH = size === "feed" ? "min-h-[26px]" : "min-h-[24px]";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Scope the toggle to the pill — the card's body click-to-navigate
    // handler already excludes `button` targets, but stop here too so
    // there's no ambiguity.
    event.stopPropagation();
    if (disabled) return;
    onToggle();
  };

  const style: CSSProperties = {
    color: marked ? "var(--bcc-info)" : "var(--bcc-text-secondary)",
    ...(marked
      ? { backgroundColor: "color-mix(in srgb, var(--bcc-info) 14%, transparent)" }
      : {}),
  };

  const iconStyle: CSSProperties = {
    // Reduced-motion fallback is static: no scale, no transition.
    transform: marked && !reduced ? "scale(1.08)" : "scale(1)",
    transition: reduced ? undefined : "transform 160ms ease",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={marked}
      aria-label={label}
      title={label}
      className={
        "bcc-mono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors duration-150 hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-info)] disabled:cursor-not-allowed disabled:opacity-60 " +
        minH
      }
      style={style}
    >
      <span className="inline-flex" style={iconStyle}>
        <HelpfulIcon size={iconSize} active={marked} />
      </span>
      <span className="hidden sm:inline">Helpful</span>
      {count > 0 ? <span>{count}</span> : null}
    </button>
  );
});

/**
 * Post surface. Reads the post's own mark pair (neutral when the backend
 * hasn't hydrated it) and toggles via useMarkHelpful.
 */
export const PostHelpfulButton = memo(function PostHelpfulButton({
  item,
  canInteract = true,
}: {
  item: FeedItem;
  /** Non-member group teaser (§4.7.6) renders the control read-only. */
  canInteract?: boolean;
}) {
  const mutation = useMarkHelpful();
  const marked = item.viewer_has_marked ?? false;
  const count = item.helpful_count ?? 0;
  const feedId = item.id;

  const onToggle = useCallback(() => {
    mutation.mutate({ feedId, hasMarked: marked });
  }, [mutation, feedId, marked]);

  return (
    <HelpfulButtonView
      marked={marked}
      count={count}
      disabled={!canInteract || mutation.isPending}
      size="feed"
      onToggle={onToggle}
    />
  );
});

/**
 * Comment surface. Same behaviour at the comment rail's smaller size.
 */
export function CommentHelpfulButton({
  feedId,
  comment,
  canInteract,
}: {
  feedId: string;
  comment: Comment;
  /** Authed + allowed-to-interact (member on gated posts). */
  canInteract: boolean;
}) {
  const mutation = useMarkHelpfulComment(feedId);
  const marked = comment.viewer_has_marked ?? false;
  const count = comment.helpful_count ?? 0;
  const commentId = comment.id;

  const onToggle = useCallback(() => {
    mutation.mutate({ commentId, hasMarked: marked });
  }, [mutation, commentId, marked]);

  return (
    <HelpfulButtonView
      marked={marked}
      count={count}
      disabled={!canInteract || mutation.isPending}
      size="comment"
      onToggle={onToggle}
    />
  );
}
