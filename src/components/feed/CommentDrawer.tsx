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
 * Anonymous viewers can read comments on non-gated posts; the
 * composer is hidden when `status !== "authenticated"`. Gated-post
 * forbidden errors render a single line ("Join to see this thread")
 * — there's nothing to read or write.
 *
 * Per §A2 every visible field comes from the server view-model.
 * Local UI state: composer textarea content, submission pending flag.
 */

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Route } from "next";

import {
  useComments,
  useCreateCommentMutation,
  useDeleteCommentMutation,
} from "@/hooks/useComments";
import { formatRelativeTime } from "@/lib/format";
import { renderTextWithMentions } from "@/lib/format/mentions";
import type { Comment } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

const COMMENT_MAX_LENGTH = 2000;

interface CommentDrawerProps {
  feedId: string;
  isOpen: boolean;
}

export function CommentDrawer({ feedId, isOpen }: CommentDrawerProps) {
  const session = useSession();
  const isAuthed = session.status === "authenticated";

  const query = useComments(feedId, { enabled: isOpen });

  if (!isOpen) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div className="bcc-mono mt-3 border-t border-cardstock-edge/40 pt-3 text-[11px] text-ink-soft/70">
        Loading comments…
      </div>
    );
  }

  if (query.isError) {
    const code = query.error?.code ?? "";
    if (code === "bcc_forbidden") {
      return (
        <div className="bcc-mono mt-3 border-t border-cardstock-edge/40 pt-3 text-[11px] text-ink-soft/80">
          Join the group to see this thread.
        </div>
      );
    }
    return (
      <div className="bcc-mono mt-3 border-t border-cardstock-edge/40 pt-3 text-[11px] text-ink-soft/70">
        Couldn&apos;t load comments. {code === "" ? "" : `(${code})`}
      </div>
    );
  }

  const items: Comment[] = (query.data?.pages ?? []).flatMap((p) => p.items);
  const hasMore = query.hasNextPage === true;

  return (
    <div className="mt-3 border-t border-cardstock-edge/40 pt-3">
      <ul className="flex flex-col gap-3">
        {items.map((comment) => (
          <li key={comment.id}>
            <CommentRow feedId={feedId} comment={comment} />
          </li>
        ))}
        {items.length === 0 && (
          <li className="bcc-mono text-[11px] text-ink-soft/60 italic">
            No comments yet.
          </li>
        )}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="bcc-mono mt-3 inline-flex min-h-[36px] items-center text-[11px] tracking-[0.18em] text-ink-soft hover:text-ink hover:underline disabled:cursor-not-allowed"
        >
          {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE →"}
        </button>
      )}

      {isAuthed ? (
        <CommentComposer feedId={feedId} />
      ) : (
        <p className="bcc-mono mt-4 text-[11px] text-ink-soft/70">
          <Link href={"/login" as Route} className="text-ink hover:underline">
            Sign in
          </Link>{" "}
          to comment.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single comment row
// ─────────────────────────────────────────────────────────────────────

function CommentRow({ feedId, comment }: { feedId: string; comment: Comment }) {
  const deleteMut = useDeleteCommentMutation();
  const canDelete = isAllowed(comment.permissions, "can_delete");
  const isPending = deleteMut.isPending;
  const authorHref = `/u/${comment.author.handle}` as Route;

  return (
    <article className="flex gap-3">
      {comment.author.avatar_url !== "" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comment.author.avatar_url}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full bg-cardstock-edge/30 object-cover"
        />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded-full bg-cardstock-edge/30" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-2">
          {comment.author.handle !== "" ? (
            <Link
              href={authorHref}
              className="bcc-stencil truncate text-[12px] text-ink hover:underline"
            >
              {comment.author.display_name !== ""
                ? comment.author.display_name
                : `@${comment.author.handle}`}
            </Link>
          ) : (
            <span className="bcc-stencil truncate text-[12px] text-ink">
              {comment.author.display_name !== "" ? comment.author.display_name : "Anonymous"}
            </span>
          )}
          <time
            dateTime={comment.posted_at}
            title={comment.posted_at}
            className="bcc-mono shrink-0 text-[10px] text-ink-soft/70"
          >
            {formatRelativeTime(comment.posted_at)}
          </time>
          {canDelete && (
            <button
              type="button"
              onClick={() =>
                deleteMut.mutate({ feedId, commentId: comment.id })
              }
              disabled={isPending}
              className="bcc-mono ml-auto inline-flex min-h-[36px] shrink-0 items-center px-2 text-[11px] tracking-[0.18em] text-ink-soft/60 hover:text-ink disabled:cursor-not-allowed"
              aria-label="Delete comment"
            >
              {isPending ? "…" : "DELETE"}
            </button>
          )}
        </header>
        <p className="font-serif text-[14px] text-ink whitespace-pre-line">
          {renderTextWithMentions(comment.body, comment.mentions)}
        </p>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────

function CommentComposer({ feedId }: { feedId: string }) {
  const [draft, setDraft] = useState("");
  const createMut = useCreateCommentMutation();
  const trimmed = draft.trim();
  const canSubmit =
    trimmed !== "" && trimmed.length <= COMMENT_MAX_LENGTH && !createMut.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    createMut.mutate(
      { feed_id: feedId, body: trimmed },
      {
        onSuccess: () => {
          setDraft("");
        },
      }
    );
  };

  const error = createMut.error;
  const overCap = trimmed.length > COMMENT_MAX_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <label className="sr-only" htmlFor={`comment-${feedId}`}>
        Write a comment
      </label>
      <textarea
        id={`comment-${feedId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        maxLength={COMMENT_MAX_LENGTH * 2 /* soft over-type buffer; canSubmit gates submit */}
        placeholder="Write a comment…"
        className="bcc-input w-full resize-y rounded-md border border-cardstock-edge/40 bg-cardstock px-3 py-2 text-[14px] text-ink focus:border-cardstock-edge focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="bcc-mono text-[10px] text-ink-soft/60">
          {trimmed.length}/{COMMENT_MAX_LENGTH}
          {error !== null && (
            <span className="ml-2 text-safety">
              {error.message !== "" ? error.message : `(${error.code ?? "error"})`}
            </span>
          )}
          {overCap && !error && (
            <span className="ml-2 text-safety">Over the {COMMENT_MAX_LENGTH}-char cap.</span>
          )}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="bcc-mono inline-flex min-h-[36px] items-center rounded-full border border-cardstock-edge/40 bg-cardstock px-4 text-[11px] tracking-[0.18em] text-ink hover:border-cardstock-edge disabled:cursor-not-allowed disabled:text-ink-soft/50"
        >
          {createMut.isPending ? "POSTING…" : "COMMENT"}
        </button>
      </div>
    </form>
  );
}
