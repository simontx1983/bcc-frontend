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
 * supplies the server truth. A failure rolls back inside the hook and the
 * control returns to its prior state.
 *
 * F-258 (audit M5): that rollback used to be silent, for a signed-out
 * visitor's 401 too. Signed out, the pill is now a sign-in link with the
 * same look, and a failed toggle says so in a line (ReactionFailureNotice):
 * the post pill owns its line, a comment row owns one for its two pills.
 *
 * Rest state matches the neighbouring rail buttons (neutral secondary
 * text); active state fills the pill with a faint info tint + a bolder,
 * filled icon. Motion is a single reduced-motion-gated scale nudge on the
 * icon when marked; with reduced motion the active state is fully static.
 */

import { useSession } from "next-auth/react";
import { memo, useCallback, type CSSProperties, type MouseEvent } from "react";

import { HelpfulIcon } from "@/components/feed/actionIcons";
import {
  ReactionFailureNotice,
  ReactionSignInLink,
  REACTION_COPY,
  useReactionFailure,
  type ReactionFeedback,
} from "@/components/feed/ReactionFailureNotice";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMarkHelpful, useMarkHelpfulComment } from "@/hooks/useMarkHelpful";
import type { Comment, FeedItem } from "@/lib/api/types";
import { HIT_AREA_44 } from "@/components/feed/hitArea";

type HelpfulSize = "feed" | "comment";

interface HelpfulButtonViewProps {
  marked: boolean;
  count: number;
  disabled: boolean;
  size: HelpfulSize;
  onToggle: () => void;
  /** Signed out: render the same pill as a link to sign in. */
  signIn?: boolean;
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
  signIn = false,
}: HelpfulButtonViewProps) {
  const reduced = usePrefersReducedMotion();

  // Endorsement copy — state-descriptive, no cadence-pressure nudging.
  const label = marked ? "You marked this helpful" : "Mark this as helpful";
  const iconSize = size === "feed" ? 17 : 15;
  // Both sizes get the 44×44 hit area: the feed pill since F-355, and the
  // compact comment pill since F-440, whose row is spaced (gap-3) for it.
  const minH = size === "feed" ? `min-h-[26px] ${HIT_AREA_44}` : `min-h-[24px] ${HIT_AREA_44}`;

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

  const pillClass =
    "bcc-mono inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] transition-colors duration-150 hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-info)] " +
    minH;
  const body = (
    <>
      <span className="inline-flex" style={iconStyle}>
        <HelpfulIcon size={iconSize} active={marked} />
      </span>
      <span className="hidden sm:inline">Helpful</span>
      {count > 0 ? <span>{count}</span> : null}
    </>
  );

  if (signIn) {
    return (
      <ReactionSignInLink label={REACTION_COPY.helpful.signIn} className={pillClass} style={style}>
        {body}
      </ReactionSignInLink>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={marked}
      aria-label={label}
      title={label}
      className={`${pillClass} disabled:cursor-not-allowed disabled:opacity-60`}
      style={style}
    >
      {body}
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
  const { failure, report, clear } = useReactionFailure();
  // Only a settled "unauthenticated" swaps in the link (no flash while the
  // session loads). The non-member teaser stays read-only for everyone.
  const signIn = useSession().status === "unauthenticated" && canInteract;
  const marked = item.viewer_has_marked ?? false;
  const count = item.helpful_count ?? 0;
  const feedId = item.id;

  const onToggle = useCallback(() => {
    clear();
    mutation.mutate(
      { feedId, hasMarked: marked },
      { onError: (err) => report(err, "helpful", marked) },
    );
  }, [mutation, feedId, marked, clear, report]);

  // A fragment: the notice is a sibling in PostActionBar's wrapping row,
  // where "order-last basis-full" puts a line under the whole row.
  return (
    <>
      <HelpfulButtonView
        marked={marked}
        count={count}
        disabled={!canInteract || mutation.isPending}
        size="feed"
        onToggle={onToggle}
        signIn={signIn}
      />
      <ReactionFailureNotice failure={failure} className="order-last basis-full" />
    </>
  );
});

/**
 * Comment surface. Same behaviour at the comment rail's smaller size.
 */
export function CommentHelpfulButton({
  feedId,
  comment,
  canInteract,
  signIn,
  feedback,
}: {
  feedId: string;
  comment: Comment;
  /** Authed + allowed-to-interact (member on gated posts). */
  canInteract: boolean;
  /** Signed out on a thread they could otherwise react in: a sign-in link. */
  signIn: boolean;
  /** The comment row's failure line (one for its Stoke and Helpful). */
  feedback: ReactionFeedback;
}) {
  const mutation = useMarkHelpfulComment(feedId);
  const marked = comment.viewer_has_marked ?? false;
  const count = comment.helpful_count ?? 0;
  const commentId = comment.id;
  const { report, clear } = feedback;

  const onToggle = useCallback(() => {
    clear();
    mutation.mutate(
      { commentId, hasMarked: marked },
      { onError: (err) => report(err, "helpful", marked) },
    );
  }, [mutation, commentId, marked, clear, report]);

  return (
    <HelpfulButtonView
      marked={marked}
      count={count}
      disabled={!canInteract || mutation.isPending}
      size="comment"
      onToggle={onToggle}
      signIn={signIn}
    />
  );
}
