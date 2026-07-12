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
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import {
  useComments,
  useCreateCommentMutation,
  useDeleteCommentMutation,
} from "@/hooks/useComments";
import { useCommentStoke } from "@/hooks/useCommentStoke";
import { humanizeCode } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format";
import { renderTextWithMentions } from "@/lib/format/mentions";
import type { Comment } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

const COMMENT_MAX_LENGTH = 2000;
/** Grow-with-text cap for the composer (~6 lines) before it scrolls. */
const COMPOSER_MAX_HEIGHT = 160;

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

  const query = useComments(feedId, { enabled: isOpen });

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

  return (
    <div className="mt-3 border-t border-[var(--bcc-border)] pt-3">
      {/* Filter row (§C15). "Newest" is the server default and the only
          order the flat comment view-model supports today; "Top" is
          pending a comment score + sort param on bcc-trust (see the
          C-batch backend brief). Shown disabled so the affordance reads
          without pretending to work. */}
      {items.length > 0 && <CommentFilterRow />}

      {/* Sprint 5 empty-state hygiene: the "No comments yet." line was
          deleted — it restated an absence the composer below already
          answers as the next action. Empty state is now communicated
          by the empty list itself; the loading branch above still
          renders its skeleton so a load-in-flight isn't confused for
          "no comments yet." */}
      <ul className="flex flex-col gap-3">
        {items.map((comment) => (
          <li key={comment.id}>
            <CommentRow
              feedId={feedId}
              comment={comment}
              canStoke={isAuthed && canInteract}
            />
          </li>
        ))}
      </ul>

      {hasMore &&
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
          <CommentComposer feedId={feedId} autoFocus={focusComposer} />
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
// Filter row
// ─────────────────────────────────────────────────────────────────────

function CommentFilterRow() {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <span
        className="bcc-mono rounded-full px-2.5 py-1 text-[10px] tracking-[0.14em] text-[var(--bcc-accent)]"
        style={{ background: "var(--bcc-accent-subtle)" }}
        aria-current="true"
      >
        NEWEST
      </span>
      <span
        className="bcc-mono cursor-not-allowed rounded-full px-2.5 py-1 text-[10px] tracking-[0.14em] text-[var(--bcc-text-muted)] opacity-60"
        title="Top comments — coming soon"
      >
        TOP
      </span>
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
}: {
  feedId: string;
  comment: Comment;
  /** Viewer is authed AND allowed to interact (member on gated posts). */
  canStoke: boolean;
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
      <div className="pl-[40px]">
        <CommentActionRail feedId={feedId} comment={comment} canStoke={canStoke} />
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Action rail — Stoke (live) + Reply / Share (disabled until Slice 2's
// parent_id + comment permalink land). Mirrors the feed stoke visual
// language at a smaller size.
// ─────────────────────────────────────────────────────────────────────

function CommentActionRail({
  feedId,
  comment,
  canStoke,
}: {
  feedId: string;
  comment: Comment;
  canStoke: boolean;
}) {
  return (
    <div className="-ml-1 flex items-center gap-1">
      <CommentStokeButton feedId={feedId} comment={comment} canStoke={canStoke} />
      <SoonAction label="Reply" title="Replies — coming soon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
        </svg>
      </SoonAction>
      <SoonAction label="Share" title="Share — coming soon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
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
  const color = hasStoked ? "var(--bcc-secondary)" : "var(--bcc-stoke-ash)";

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
}: {
  feedId: string;
  /** Focus the textarea + scroll it into view once, on mount. */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const createMut = useCreateCommentMutation();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = draft.trim();
  const overCap = trimmed.length > COMMENT_MAX_LENGTH;
  const canSubmit = trimmed !== "" && !overCap && !createMut.isPending;

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
    createMut.mutate(
      { feed_id: feedId, body: trimmed },
      {
        onSuccess: () => {
          setDraft("");
          setExpanded(false);
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
        <div className="flex items-end gap-2">
          <textarea
            id={`comment-${feedId}`}
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setExpanded(true)}
            rows={1}
            maxLength={COMMENT_MAX_LENGTH * 2 /* soft over-type buffer; canSubmit gates submit */}
            placeholder="Write a comment…"
            className="w-full flex-1 resize-none bg-transparent text-[14px] leading-snug text-[var(--bcc-text)] placeholder:text-[var(--bcc-text-muted)] focus:outline-none"
          />

          {/* Icon-only submit while the box is at rest. */}
          {!expanded && (
            <SubmitIconButton disabled={!canSubmit} pending={createMut.isPending} />
          )}
        </div>

        {/* Expanded footer — word count + collapse + full submit, all
            inside the box (§C14). */}
        {expanded && (
          <div className="flex items-center justify-between gap-3">
            <p className="bcc-mono text-[10px] text-[var(--bcc-text-muted)]">
              {trimmed.length}/{COMMENT_MAX_LENGTH}
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
