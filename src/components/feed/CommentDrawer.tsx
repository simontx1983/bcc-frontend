"use client";

/**
 * CommentDrawer — lazy-mounted comment surface for a FeedItem.
 *
 * Opens inline below the post (no modal, no route navigation) when the
 * user clicks the comment-count chip on FeedItemCard. Mount is gated
 * by the parent's `isOpen` state so we don't fire the GET request
 * until the user actually wants comments — feed cards stay light by
 * default.
 *
 * Visual grammar: social. The drawer is part of the v1.5 social layer
 * (warm, expressive) — author avatars + names + body + relative time.
 * Trust-bearing posts also get the same drawer; the §D5 distinction
 * lives in the reaction rail, not the comments thread (see
 * docs/api-contract-v1.md §3.5).
 *
 * Chrome is themed (`--bcc-*` day/night tokens), NOT the cardstock/ink
 * trading-card palette — comments are page chrome and must flip with
 * light/dark. The composer is a glassy, sticky, grow-with-text bar (the
 * §C13 redesign) so the way to reply is always at hand while the thread
 * scrolls above it.
 *
 * Anonymous viewers can read comments on non-gated posts; the
 * composer is hidden when `status !== "authenticated"`. Gated-post
 * forbidden errors render a single line ("Join to see this thread")
 * — there's nothing to read or write.
 *
 * Per §A2 every visible field comes from the server view-model.
 * Local UI state: composer textarea content, focus/expand, submission flag.
 *
 * Deferred (need bcc-trust/bcc-core first, see the C-batch backend brief in
 * docs/): gif/image attach, nested/threaded replies, and a "Top" sort — the
 * comment view-model is flat, text-only, and unsorted today.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";

import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { buildCommentTree, findNode, type CommentNode } from "@/lib/comments/thread";
import { CommentGifPicker } from "@/components/feed/CommentGifPicker";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import {
  useComments,
  useCreateCommentMutation,
  useDeleteCommentMutation,
} from "@/hooks/useComments";
import { useCommentStoke } from "@/hooks/useCommentStoke";
import { useGiphyIntegration } from "@/hooks/useGiphyIntegration";
import { uploadBlogCoverImage } from "@/lib/api/blog-endpoints";
import { humanizeCode } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format";
import { renderTextWithMentions } from "@/lib/format/mentions";
import type {
  Comment,
  CommentMedia,
  CommentSort,
  GiphySearchResult,
} from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

const COMMENT_MAX_LENGTH = 2000;
/** Grow-with-text cap for the composer (~6 lines) before it scrolls. */
const COMPOSER_MAX_HEIGHT = 160;

/**
 * Slice 2 nesting — how many indented tiers render before a thread is
 * folded behind the "Follow the thread" drill control. Tiers are 0-indexed
 * relative to the current view root: relativeDepth 0…MAX_RENDER_DEPTH-1
 * render inline; a node whose children would land at MAX_RENDER_DEPTH shows
 * the control instead. 5 = five visible tiers (Tia's call — Reddit does ~10,
 * 5 reads fine in a drawer). Drilling in re-roots and the count resets.
 */
const MAX_RENDER_DEPTH = 5;
/** px the guide-line indents each nested tier. */
const THREAD_INDENT = 14;
/** Drill-control copy (Tia wanted something other than "Continue thread"). */
const CONTINUE_LABEL = "Follow the thread";

/** A reply-in-progress target: the composer sends `parent_id` + shows a chip. */
interface ReplyTarget {
  parentId: string;
  handle: string;
  displayName: string;
}

interface CommentDrawerProps {
  feedId: string;
  isOpen: boolean;
  /**
   * When false, existing comments still render (read-only) but the
   * write composer is suppressed entirely — used by the §4.7.6
   * non-member group teaser where commenting is member-only (server
   * returns 403). Defaults to true so every other feed surface keeps
   * its composer.
   */
  canInteract?: boolean;
  /** Focus the composer textarea + scroll it into view on mount. */
  focusComposer?: boolean;
}

export function CommentDrawer({
  feedId,
  isOpen,
  canInteract = true,
  focusComposer = false,
}: CommentDrawerProps) {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  // §C15 sort — `relevant` is the server default (lean stoke×recency).
  const [sort, setSort] = useState<CommentSort>("relevant");
  const query = useComments(feedId, { enabled: isOpen, sort });

  // Slice 2 — drill-down stack (ids of the pivots we've followed into) and
  // the active reply target. Both are drawer-scoped local UI state (§A2).
  const [focusStack, setFocusStack] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const drillInto = useCallback((commentId: string) => {
    setFocusStack((stack) => [...stack, commentId]);
  }, []);
  const drillBack = useCallback(() => {
    setFocusStack((stack) => stack.slice(0, -1));
  }, []);
  const startReply = useCallback((comment: Comment) => {
    setReplyTarget({
      parentId: comment.id,
      handle: comment.author.handle,
      displayName: comment.author.display_name,
    });
  }, []);
  const clearReply = useCallback(() => setReplyTarget(null), []);

  // The drawer stays mounted (returns null) when collapsed, so reset the
  // drill + reply state on close — reopening should land on the top of the
  // thread, not wherever the viewer last drilled.
  useEffect(() => {
    if (!isOpen) {
      setFocusStack([]);
      setReplyTarget(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div
        aria-label="Loading comments"
        className="mt-3 flex flex-col gap-2 border-t border-[var(--bcc-border)] pt-3"
      >
        <Skeleton className="h-12" count={2} />
      </div>
    );
  }

  if (query.isError) {
    const code = query.error?.code ?? "";
    if (code === "bcc_forbidden") {
      return (
        <div className="bcc-mono mt-3 border-t border-[var(--bcc-border)] pt-3 text-[11px] text-[var(--bcc-text-secondary)]">
          Join the group to see this thread.
        </div>
      );
    }
    return (
      <div className="bcc-mono mt-3 border-t border-[var(--bcc-border)] pt-3 text-[11px] text-[var(--bcc-text-muted)]">
        Couldn&apos;t load comments. {code === "" ? "" : `(${code})`}
      </div>
    );
  }

  const items: Comment[] = (query.data?.pages ?? []).flatMap((p) => p.items);
  const hasMore = query.hasNextPage === true;

  // Slice 2 — thread the flat list, then resolve the current view root:
  // the whole forest at the top level, or a single pivot subtree when the
  // viewer has followed a thread. An orphaned pivot (parent scrolled out of
  // the loaded pages / deleted) yields a null node → we show a graceful
  // "thread unavailable" bar rather than an empty drawer.
  const tree = buildCommentTree(items);
  const focusId = focusStack.length > 0 ? focusStack[focusStack.length - 1] : undefined;
  const focusNode = focusId !== undefined ? findNode(tree, focusId) : null;
  const isDrilled = focusId !== undefined;
  const rootNodes = isDrilled ? (focusNode !== null ? [focusNode] : []) : tree;
  const baseDepth = focusNode !== null ? focusNode.depth : 0;
  const canStoke = isAuthed && canInteract;

  return (
    <div className="mt-3 border-t border-[var(--bcc-border)] pt-3">
      {/* Drill-down header — back out of a followed thread, with the
          collapsed-ancestor indicator (the "earlier replies are hidden"
          several-lines motif). Only in a drilled view. */}
      {isDrilled ? (
        <DrillHeader onBack={drillBack} unavailable={focusNode === null} />
      ) : (
        /* Filter row (§C15) — Relevant (default) / Top / New, all live.
           Relevant + Top sort on the comment stoke_count; the server owns
           the ordering (§A2). Hidden inside a drilled thread. */
        items.length > 0 && <CommentFilterRow sort={sort} onSortChange={setSort} />
      )}

      {/* Sprint 5 empty-state hygiene: the "No comments yet." line was
          deleted — it restated an absence the composer below already
          answers as the next action. Empty state is now communicated
          by the empty list itself; the loading branch above still
          renders its skeleton so a load-in-flight isn't confused for
          "no comments yet." */}
      <div className="flex flex-col gap-3">
        {rootNodes.map((node) => (
          <CommentBranch
            key={node.comment.id}
            node={node}
            baseDepth={baseDepth}
            feedId={feedId}
            canStoke={canStoke}
            onReply={startReply}
            onContinue={drillInto}
          />
        ))}
      </div>

      {/* Load-more pages the flat list (root view only — a drilled subtree
          renders from the already-loaded set). */}
      {!isDrilled &&
        hasMore &&
        (query.isFetchingNextPage ? (
          <div className="mt-3 flex py-1 text-[var(--bcc-accent)]">
            <Spinner size={18} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            className="bcc-mono mt-3 inline-flex min-h-[36px] items-center text-[11px] tracking-[0.18em] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)] hover:underline"
          >
            LOAD MORE →
          </button>
        ))}

      {/* Non-member group teaser (canInteract=false): suppress both the
          composer AND the anonymous sign-in prompt. The "join to
          interact" affordance lives once on GroupFeedSection — repeating
          a write prompt per card here would be redundant noise. */}
      {canInteract &&
        (isAuthed ? (
          <CommentComposer
            feedId={feedId}
            autoFocus={focusComposer}
            replyTarget={replyTarget}
            onClearReply={clearReply}
          />
        ) : (
          <p className="bcc-mono mt-4 text-[11px] text-[var(--bcc-text-muted)]">
            <Link href={"/login" as Route} className="text-[var(--bcc-text)] hover:underline">
              Sign in
            </Link>{" "}
            to comment.
          </p>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Threaded tree (Slice 2)
//
// A branch renders its comment row, then either its children (indented by
// a guide line) or — once the nesting would exceed MAX_RENDER_DEPTH — a
// single "Follow the thread" control that drills the drawer into that
// subtree (re-rooted, cap resets). This keeps deep threads scalable
// without unbounded horizontal indent, and — crucially — the CONTROL is
// the affordance, never the comment itself (so no comment is a one-off
// click-through link; see the §Slice-2 design note in the handover).
// ─────────────────────────────────────────────────────────────────────

function CommentBranch({
  node,
  baseDepth,
  feedId,
  canStoke,
  onReply,
  onContinue,
}: {
  node: CommentNode;
  /** Depth of the current view's root, subtracted so a drilled pivot is tier 0. */
  baseDepth: number;
  feedId: string;
  /** Authed + member gate — shared by Stoke and Reply (identical condition). */
  canStoke: boolean;
  onReply: (comment: Comment) => void;
  onContinue: (commentId: string) => void;
}) {
  const relativeDepth = node.depth - baseDepth;
  const hasChildren = node.children.length > 0;
  // Children would land one tier deeper; fold them behind the drill control
  // when that tier reaches the cap.
  const childrenAtCap = relativeDepth + 1 >= MAX_RENDER_DEPTH;

  return (
    <div className="flex flex-col gap-3">
      <CommentRow
        feedId={feedId}
        comment={node.comment}
        canStoke={canStoke}
        canReply={canStoke}
        onReply={onReply}
      />

      {hasChildren &&
        (childrenAtCap ? (
          <ContinueControl node={node} onContinue={onContinue} />
        ) : (
          <div
            className="flex flex-col gap-3 border-l border-[var(--bcc-border)] pl-3"
            style={{ marginLeft: THREAD_INDENT }}
          >
            {node.children.map((child) => (
              <CommentBranch
                key={child.comment.id}
                node={child}
                baseDepth={baseDepth}
                feedId={feedId}
                canStoke={canStoke}
                onReply={onReply}
                onContinue={onContinue}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

/** Drill affordance at the indent cap — the ONLY click-through into a subtree. */
function ContinueControl({
  node,
  onContinue,
}: {
  node: CommentNode;
  onContinue: (commentId: string) => void;
}) {
  // Prefer the server's direct-reply count; fall back to what's loaded.
  const count = node.comment.reply_count ?? node.children.length;
  return (
    <button
      type="button"
      onClick={() => onContinue(node.comment.id)}
      className="group flex items-center gap-2 pl-3 text-left"
      style={{ marginLeft: THREAD_INDENT }}
    >
      {/* Several stacked strokes = "more replies are threaded below". */}
      <HiddenThreadLines />
      <span className="bcc-mono text-[11px] tracking-[0.08em] text-[var(--bcc-accent)] group-hover:underline">
        {CONTINUE_LABEL}
        {count > 0 ? ` (${count})` : ""} →
      </span>
    </button>
  );
}

/** The "collapsed replies" motif — a small stack of skewed strokes. */
function HiddenThreadLines() {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden>
      <path
        d="M3 1 1 6M7 1 5 6M11 1 9 6"
        stroke="var(--bcc-border)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Drilled-thread header — back out one level, plus the collapsed-ancestor
 * indicator (the several-lines motif from Tia's sketch) signalling that
 * earlier replies sit above this focused subtree.
 */
function DrillHeader({
  onBack,
  unavailable,
}: {
  onBack: () => void;
  unavailable: boolean;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={onBack}
        className="bcc-mono inline-flex min-h-[32px] w-fit items-center gap-1.5 text-[11px] tracking-[0.08em] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 3.5 5.5 8 10 12.5" />
        </svg>
        Back
      </button>
      {unavailable ? (
        <p className="bcc-mono text-[11px] text-[var(--bcc-text-muted)]">
          This part of the thread isn&apos;t loaded anymore.
        </p>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-left"
        >
          <HiddenThreadLines />
          <span className="bcc-mono text-[11px] text-[var(--bcc-text-muted)] hover:text-[var(--bcc-text-secondary)]">
            Earlier in this thread
          </span>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Filter row
// ─────────────────────────────────────────────────────────────────────

const SORT_TABS: ReadonlyArray<{ value: CommentSort; label: string; title: string }> = [
  { value: "relevant", label: "RELEVANT", title: "Best first — stoke + recency" },
  { value: "top",      label: "TOP",      title: "Most-stoked first" },
  { value: "new",      label: "NEW",      title: "Newest first" },
];

function CommentFilterRow({
  sort,
  onSortChange,
}: {
  sort: CommentSort;
  onSortChange: (sort: CommentSort) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      {SORT_TABS.map((tab) => {
        const active = tab.value === sort;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onSortChange(tab.value)}
            aria-current={active ? "true" : undefined}
            title={tab.title}
            className={
              "bcc-mono rounded-full px-2.5 py-1 text-[10px] tracking-[0.14em] transition-colors " +
              (active
                ? "text-[var(--bcc-accent)]"
                : "text-[var(--bcc-text-muted)] hover:text-[var(--bcc-text-secondary)]")
            }
            style={active ? { background: "var(--bcc-accent-subtle)" } : undefined}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single comment row
// ─────────────────────────────────────────────────────────────────────

function CommentRow({
  feedId,
  comment,
  canStoke,
  canReply,
  onReply,
}: {
  feedId: string;
  comment: Comment;
  /** Viewer is authed AND allowed to interact (member on gated posts). */
  canStoke: boolean;
  /** Same gate as canStoke — drives the live Reply affordance. */
  canReply: boolean;
  onReply: (comment: Comment) => void;
}) {
  const canDelete = isAllowed(comment.permissions, "can_delete");

  // CommentAuthor (types.ts) ships handle, display_name, avatar_url plus
  // rank/tier + vouch fields; AuthorBadge gracefully omits the RankChip
  // when rank_label is absent.
  return (
    <article className="flex flex-col gap-1">
      <AuthorBadge
        author={{
          id: comment.author.id,
          handle: comment.author.handle,
          display_name: comment.author.display_name,
          avatar_url: comment.author.avatar_url,
          // Per-author Vouch toggle next to the commenter's name — same
          // vouch, same weight as the feed byline (authed-only; absent
          // fields → the toggle self-hides).
          viewer_attestation: comment.author.viewer_attestation,
          can_vouch: comment.author.can_vouch,
        }}
        size="sm"
        avatarRingColor="var(--bcc-accent)"
        trailing={
          <div className="flex items-center gap-1">
            <time
              dateTime={comment.posted_at}
              title={comment.posted_at}
              className="bcc-mono shrink-0 text-[10px] text-[var(--bcc-text-muted)]"
            >
              {formatRelativeTime(comment.posted_at)}
            </time>
            <CommentOverflowMenu
              feedId={feedId}
              comment={comment}
              canDelete={canDelete}
            />
          </div>
        }
      />
      <p className="whitespace-pre-line pl-[40px] font-serif text-[14px] text-[var(--bcc-text)]">
        {renderTextWithMentions(comment.body, comment.mentions)}
      </p>
      {comment.media !== undefined && (
        <div className="pl-[40px]">
          <CommentMediaView media={comment.media} />
        </div>
      )}
      <div className="pl-[40px]">
        <CommentActionRail
          feedId={feedId}
          comment={comment}
          canStoke={canStoke}
          canReply={canReply}
          onReply={onReply}
        />
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Action rail — Stoke (live) + Reply (live, Slice 2) + Share (disabled
// until the comment permalink lands). Mirrors the feed stoke visual
// language at a smaller size.
// ─────────────────────────────────────────────────────────────────────

function CommentActionRail({
  feedId,
  comment,
  canStoke,
  canReply,
  onReply,
}: {
  feedId: string;
  comment: Comment;
  canStoke: boolean;
  canReply: boolean;
  onReply: (comment: Comment) => void;
}) {
  return (
    <div className="-ml-1 flex items-center gap-1">
      <CommentStokeButton feedId={feedId} comment={comment} canStoke={canStoke} />
      {/* Reply seeds the composer with this comment's parent_id + a
          "replying to @handle" chip. Icon matches the feed speech-bubble.
          Optimistic replies (an unsaved comment_optimistic_* id) can't be
          a parent yet, so Reply is suppressed until the row is confirmed. */}
      {canReply && !comment.id.startsWith("comment_optimistic_") ? (
        <button
          type="button"
          onClick={() => onReply(comment)}
          aria-label={`Reply to ${comment.author.display_name}`}
          title="Reply"
          className="bcc-mono inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-hover)] hover:text-[var(--bcc-text)]"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" />
          </svg>
          Reply
        </button>
      ) : (
        <SoonAction label="Reply" title="Replies — coming soon">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" />
          </svg>
        </SoonAction>
      )}
      <SoonAction label="Share" title="Share — coming soon">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6.5 3.5h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" />
          <path d="M7 9 12.5 3.5M9 3.5h3.5V7" />
        </svg>
      </SoonAction>
    </div>
  );
}

function CommentStokeButton({
  feedId,
  comment,
  canStoke,
}: {
  feedId: string;
  comment: Comment;
  canStoke: boolean;
}) {
  const stokeMut = useCommentStoke(feedId);

  // Presence of the field is the rollout signal — a pre-1.2.22 backend
  // omits it, so we hide the flame rather than post to a 404 endpoint.
  if (comment.viewer_has_stoked === undefined && comment.stoke_count === undefined) {
    return null;
  }

  const hasStoked = comment.viewer_has_stoked ?? false;
  const count = comment.stoke_count ?? 0;
  const disabled = !canStoke || stokeMut.isPending;
  // Match the feed flame's resting look: burnt-orange outline when
  // unstoked (like the post rail's cold heat-stage), solid forge-orange
  // when stoked — not the grey-brown stoke-ash, which read as an odd
  // yellow next to the feed's flame.
  const color = hasStoked ? "var(--bcc-secondary)" : "var(--bcc-secondary-dark)";

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        stokeMut.mutate({ commentId: comment.id, hasStoked });
      }}
      disabled={disabled}
      aria-pressed={hasStoked}
      aria-label={hasStoked ? "Stoked — tap to remove" : "Stoke"}
      title={hasStoked ? "Stoked — tap to remove" : "Stoke"}
      className="bcc-mono inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 text-[11px] hover:bg-[var(--bcc-surface-hover)] disabled:cursor-not-allowed disabled:hover:bg-transparent"
      style={{ color }}
    >
      <CommentFlameIcon color={color} outline={!hasStoked} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

/** Disabled "coming soon" action — reads as an affordance without pretending to work. */
function SoonAction({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      aria-disabled="true"
      className="bcc-mono inline-flex min-h-[32px] cursor-not-allowed items-center gap-1 rounded-full px-2 text-[11px] text-[var(--bcc-text-muted)] opacity-60"
    >
      {children}
      {label}
    </span>
  );
}

function CommentFlameIcon({ color, outline }: { color: string; outline: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2c1.2 2.6-0.4 4-1.4 5.4C9.4 8.8 8 10.4 8 12.8c0 .9.2 1.7.6 2.4-1-.5-1.8-1.4-2.2-2.6-.7 1-1.1 2.2-1.1 3.5 0 3.3 2.9 6 6.7 6s6.7-2.7 6.7-6c0-2.6-1-4.3-2.3-5.9.1.8.1 1.6-.1 2.3-.4-2.6-1.9-4.6-3.5-6.2C13.6 5.3 12.7 3.7 12 2Z"
        fill={outline ? "none" : color}
        stroke={outline ? color : "none"}
        strokeWidth={outline ? 1.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Attached media (§3.5) — one photo XOR gif, rendered above the body.
// Photos open a lightweight zoom (the feed Lightbox wants a whole
// FeedItem + comments panel — wrong shape for a comment attachment, so
// we use the shared Dialog primitive directly). GIFs render inline.
// ─────────────────────────────────────────────────────────────────────

/** Capped display box for a comment attachment — keeps tall media from dominating the row. */
const COMMENT_MEDIA_MAX_HEIGHT = 280;

function CommentMediaView({ media }: { media: CommentMedia }) {
  const [zoomed, setZoomed] = useState(false);
  const isPhoto = media.kind === "photo";

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- remote WP/Giphy media, no per-tenant remotePatterns allow-list
    <img
      src={media.url}
      alt=""
      loading="lazy"
      decoding="async"
      {...(media.width !== undefined && media.width > 0 ? { width: media.width } : {})}
      {...(media.height !== undefined && media.height > 0 ? { height: media.height } : {})}
      className="h-auto w-auto max-w-full rounded-xl border border-[var(--bcc-border)] object-contain"
      style={{ maxHeight: COMMENT_MEDIA_MAX_HEIGHT }}
    />
  );

  return (
    <div className="mt-1.5">
      {isPhoto ? (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="View image"
          className="block max-w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bcc-accent)]"
        >
          {img}
        </button>
      ) : (
        img
      )}

      {zoomed && (
        <Dialog title="Image" bare center backdropClassName="bg-ink/90 backdrop-blur-md" onClose={() => setZoomed(false)}>
          <div className="flex max-h-[92vh] max-w-[92vw] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote media, see above */}
            <img src={media.url} alt="" className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain" />
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Overflow menu (⋯) — glassy popover replacing the old inline DELETE
// text button. Delete is live (author-only); Report + Copy link are
// stubbed until their backend / comment-permalink slices land.
// ─────────────────────────────────────────────────────────────────────

function CommentOverflowMenu({
  feedId,
  comment,
  canDelete,
}: {
  feedId: string;
  comment: Comment;
  canDelete: boolean;
}) {
  const deleteMut = useDeleteCommentMutation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="bcc-mono inline-flex min-h-[32px] items-center px-1 text-[var(--bcc-text-muted)] hover:text-[var(--bcc-text)]"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="bcc-panel absolute right-0 top-full z-20 mt-1 min-w-[140px] p-1"
        >
          <span
            role="menuitem"
            aria-disabled="true"
            title="Report — coming soon"
            className="bcc-mono block w-full cursor-not-allowed rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-muted)] opacity-60"
          >
            Report
          </span>
          <span
            role="menuitem"
            aria-disabled="true"
            title="Copy link — coming soon"
            className="bcc-mono block w-full cursor-not-allowed rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-muted)] opacity-60"
          >
            Copy link
          </span>
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                deleteMut.mutate({ feedId, commentId: comment.id });
                setOpen(false);
              }}
              disabled={deleteMut.isPending}
              className="bcc-mono block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-danger)] disabled:cursor-not-allowed"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Composer (§C12-14) — glassy, sticky, grows with text; everything
// (word count + submit) lives inside the box. The submit is icon-only
// when the box is at rest and becomes "Comment" + icon once focused.
// ─────────────────────────────────────────────────────────────────────

function CommentComposer({
  feedId,
  autoFocus = false,
  replyTarget,
  onClearReply,
}: {
  feedId: string;
  /** Focus the textarea + scroll it into view once, on mount. */
  autoFocus?: boolean;
  /** Slice 2 — when set, this submission is a reply (sends `parent_id`). */
  replyTarget: ReplyTarget | null;
  onClearReply: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const createMut = useCreateCommentMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // §3.5 attachment — one photo XOR gif. `photo` holds the uploaded
  // attachment (id for the wire + url/dims for the preview & optimistic
  // row); `gif` holds the picked Giphy result. Selecting one clears the
  // other, so only ever one is set.
  const [photo, setPhoto] = useState<
    { attachment_id: number; url: string; width: number; height: number } | null
  >(null);
  const [gif, setGif] = useState<GiphySearchResult | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // GIF button mounts only when the admin Giphy integration is on (config
  // is server-owned; anon never reaches here — the composer is authed).
  const giphy = useGiphyIntegration();
  const gifEnabled = giphy.data?.enabled === true;
  const hasMedia = photo !== null || gif !== null;

  const trimmed = draft.trim();
  const overCap = trimmed.length > COMMENT_MAX_LENGTH;
  const canSubmit = trimmed !== "" && !overCap && !createMut.isPending && !uploading;

  const clearMedia = () => {
    setPhoto(null);
    setGif(null);
    setMediaError(null);
  };

  const handlePhotoFile = async (file: File) => {
    setMediaError(null);
    setGifPickerOpen(false);
    setUploading(true);
    try {
      const res = await uploadBlogCoverImage(file);
      setGif(null);
      setPhoto({
        attachment_id: res.attachment_id,
        url: res.url,
        width: res.width,
        height: res.height,
      });
    } catch (err) {
      // Surface the real reason (too large / bad mime / rate limited)
      // rather than a generic line, reusing the shared code map.
      setMediaError(
        humanizeCode(
          err,
          {
            bcc_invalid_request: "That image can't be attached (check size/format).",
            bcc_rate_limited: "Uploading too fast — wait a moment.",
            bcc_unauthorized: "Sign in to attach an image.",
          },
          "Couldn't attach that image.",
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleGifSelect = (picked: GiphySearchResult) => {
    setPhoto(null);
    setGif(picked);
    setGifPickerOpen(false);
  };

  // Grow-with-text: size the textarea to its content up to the cap while
  // expanded; snap back to a single line when collapsed.
  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) return;
    if (expanded) {
      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
    } else {
      el.style.height = "";
      el.style.overflowY = "hidden";
    }
  }, [expanded, draft]);

  useEffect(() => {
    if (!autoFocus) return;
    setExpanded(true);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
    // Mount-only — the composer remounts when its drawer remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slice 2 — picking Reply on a row expands + focuses the composer and
  // scrolls it into view, so the reply target and the input are both on
  // screen. Keyed on the parent id so re-targeting re-triggers.
  useEffect(() => {
    if (replyTarget === null) return;
    setExpanded(true);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
  }, [replyTarget]);

  // Click-outside collapses the box so the thread above is visible; the
  // draft is preserved, and clicking back in re-expands + refocuses.
  useEffect(() => {
    if (!expanded) return undefined;
    const onDown = (e: MouseEvent) => {
      if (formRef.current !== null && !formRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded]);

  const expand = () => {
    setExpanded(true);
    textareaRef.current?.focus();
  };
  const collapse = () => {
    setExpanded(false);
    textareaRef.current?.blur();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    // §3.5 one attachment per comment — photo wins if both are somehow set.
    // `media` is the client-only optimistic-render hint (see CreateCommentRequest);
    // the wire fields are attachment_id / gif_url.
    const media: CommentMedia | undefined =
      photo !== null
        ? { kind: "photo", url: photo.url, width: photo.width, height: photo.height }
        : gif !== null
          ? { kind: "gif", url: gif.url }
          : undefined;

    createMut.mutate(
      {
        feed_id: feedId,
        body: trimmed,
        ...(photo !== null
          ? { attachment_id: photo.attachment_id }
          : gif !== null
            ? { gif_url: gif.url }
            : {}),
        ...(media !== undefined ? { media } : {}),
        // Slice 2 — reply target threads the new comment under its parent.
        ...(replyTarget !== null ? { parent_id: replyTarget.parentId } : {}),
      },
      {
        onSuccess: () => {
          setDraft("");
          setExpanded(false);
          clearMedia();
          setGifPickerOpen(false);
          onClearReply();
        },
      },
    );
  };

  const error = createMut.error;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="sticky bottom-0 z-10 mt-4 pb-1 pt-2"
    >
      <label className="sr-only" htmlFor={`comment-${feedId}`}>
        Write a comment
      </label>

      <div
        onClick={expanded ? undefined : expand}
        className="flex flex-col gap-1.5 rounded-2xl px-3 py-2 shadow-sm"
        style={{
          background: "var(--bcc-glass-bg)",
          backdropFilter: "blur(var(--bcc-glass-blur))",
          WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
          border: "1px solid var(--bcc-glass-border)",
        }}
      >
        {/* Slice 2 — "replying to @handle" chip; ✕ clears the target so the
            next submit posts a top-level comment again. */}
        {replyTarget !== null && (
          <div className="flex items-center gap-1.5">
            <span className="bcc-mono min-w-0 truncate text-[11px] text-[var(--bcc-text-secondary)]">
              Replying to{" "}
              <span className="text-[var(--bcc-accent)]">@{replyTarget.handle}</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearReply();
              }}
              aria-label="Cancel reply"
              title="Cancel reply"
              className="bcc-mono inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] leading-none text-[var(--bcc-text-muted)] hover:bg-[var(--bcc-surface-hover)] hover:text-[var(--bcc-text)]"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            id={`comment-${feedId}`}
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setExpanded(true)}
            rows={1}
            maxLength={COMMENT_MAX_LENGTH * 2 /* soft over-type buffer; canSubmit gates submit */}
            placeholder={replyTarget !== null ? `Reply to @${replyTarget.handle}…` : "Write a comment…"}
            className="w-full flex-1 resize-none bg-transparent text-[14px] leading-snug text-[var(--bcc-text)] placeholder:text-[var(--bcc-text-muted)] focus:outline-none"
          />

          {/* Icon-only submit while the box is at rest. */}
          {!expanded && (
            <SubmitIconButton disabled={!canSubmit} pending={createMut.isPending} />
          )}
        </div>

        {/* Hidden file input — driven by the photo button below. Restrict
            to the four mimes BlogCoverImageWriter accepts. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) void handlePhotoFile(file);
            e.target.value = "";
          }}
        />

        {/* Attachment preview — thumbnail + remove, or an uploading tile.
            One media at a time (§3.5); the remove-X clears it. */}
        {expanded && (hasMedia || uploading) && (
          <div className="flex items-center gap-2">
            <div className="relative inline-flex">
              {uploading ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--bcc-border)] text-[var(--bcc-accent)]">
                  <Spinner size={18} />
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote WP/Giphy media, no per-tenant remotePatterns allow-list */}
                  <img
                    src={photo?.url ?? gif?.preview_url ?? ""}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-[var(--bcc-border)] object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearMedia}
                    aria-label="Remove attachment"
                    title="Remove attachment"
                    className="bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--bcc-border)] bg-[var(--bcc-surface)] text-[11px] leading-none text-[var(--bcc-text)] hover:text-[var(--bcc-danger)]"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* GIF picker panel — inline expansion below the composer. */}
        {expanded && gifPickerOpen && gifEnabled && giphy.data !== undefined && (
          <CommentGifPicker
            config={giphy.data}
            onSelect={handleGifSelect}
            onClose={() => setGifPickerOpen(false)}
          />
        )}

        {/* Expanded footer — media buttons + word count + collapse + full
            submit, all inside the box (§C14). */}
        {expanded && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-0.5">
              <MediaIconButton
                onClick={() => fileInputRef.current?.click()}
                active={photo !== null}
                disabled={uploading}
                label="Attach photo"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L18 19" />
                </svg>
              </MediaIconButton>

              {gifEnabled && (
                <MediaIconButton
                  onClick={() => setGifPickerOpen((o) => !o)}
                  active={gif !== null || gifPickerOpen}
                  disabled={uploading}
                  label="Attach GIF"
                >
                  <span className="bcc-mono text-[11px] font-bold tracking-tight">GIF</span>
                </MediaIconButton>
              )}

              <p className="bcc-mono ml-1 min-w-0 truncate text-[10px] text-[var(--bcc-text-muted)]">
                {trimmed.length}/{COMMENT_MAX_LENGTH}
                {mediaError !== null && (
                  <span className="ml-2 text-[var(--bcc-danger)]">{mediaError}</span>
                )}
                {error !== null && (
                  <span className="ml-2 text-[var(--bcc-danger)]">
                    {humanizeCode(
                      error,
                      {
                        bcc_unauthorized: "Sign in to comment.",
                        bcc_rate_limited: "Commenting too fast — slow down.",
                        bcc_forbidden: "You can't comment here.",
                        bcc_invalid_request: "Comment couldn't be posted.",
                        bcc_too_many_mentions: "Too many @-mentions in one comment.",
                        bcc_invalid_mention_target:
                          "One of your @-mentions can't receive notifications.",
                      },
                      "Couldn't post the comment.",
                    )}
                  </span>
                )}
                {overCap && error === null && (
                  <span className="ml-2 text-[var(--bcc-danger)]">
                    Over the {COMMENT_MAX_LENGTH}-char cap.
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={collapse}
                aria-label="Collapse composer"
                title="Collapse"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-hover)] hover:text-[var(--bcc-text)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {/* two arrows collapsing toward center */}
                  <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                </svg>
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="bcc-btn bcc-btn-sm bcc-btn-primary"
              >
                {createMut.isPending ? "Posting…" : "Comment"}
                <SendIcon />
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

function SubmitIconButton({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label="Post comment"
      title="Post comment"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--bcc-text-inverse)] transition-opacity disabled:opacity-40"
      style={{ background: "var(--bcc-accent)" }}
    >
      {pending ? (
        <span className="bcc-mono text-[10px]">…</span>
      ) : (
        <SendIcon />
      )}
    </button>
  );
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

/** Composer attach button (photo / gif) — accent-tinted when its media is selected. */
function MediaIconButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 transition-colors hover:bg-[var(--bcc-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: active ? "var(--bcc-accent)" : "var(--bcc-text-secondary)" }}
    >
      {children}
    </button>
  );
}
