"use client";

/**
 * The canonical discussion on an announcement.
 *
 * "Thread" here means the **flat chronological discussion** — v1 has no
 * nested replies, so there is no reply target, no indent and no drill
 * control. Oldest-first, so new comments land at the bottom.
 *
 * Removed comments are NOT dropped from the list: each stays in position
 * as a tombstone. The tombstone's copy is **server-authored** and comes
 * in exactly two flavours — removed by the author, or removed by the
 * validator. The client renders `label` verbatim and never composes
 * removal copy, because it cannot know which actor the server recorded:
 * an operator removing their own comment counts as an author removal.
 *
 * A tombstone carries id / removed_at / label and nothing else — no
 * body, author, avatar, user id, actor type or reason. The discriminated
 * union makes that a type error rather than a review question.
 */

import { useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { humanizeCode } from "@/lib/api/errors";
import { formatAbsoluteDateTime, formatShortDate } from "@/lib/format";
import { isAllowed, reasonCode, unlockHint } from "@/lib/permissions";
import {
  useAnnouncementComments,
  useCreateAnnouncementComment,
  useRemoveAnnouncementComment,
} from "@/hooks/useAnnouncements";
import type { AnnouncementComment } from "@/lib/api/types";

/** Contract bound (§4.32.7). Mirrored for UX; the server re-checks. */
export const ANNOUNCEMENT_COMMENT_MAX = 2000;

/**
 * Why the composer is absent, in the viewer's words.
 *
 * Keyed on the server's `reason_code`, never inferred. The final
 * fallback is deliberately generic: an unrecognised reason must still
 * close the composer and say *something*, because silently rendering
 * nothing reads as a broken page, and guessing at the reason risks
 * telling the viewer something untrue about their own account.
 *
 * `auth_required` is handled ahead of the map because the client knows
 * its own session state and can offer the more useful instruction.
 */
export function deniedCopy(
  viewerAuthed: boolean,
  reason: string | null,
  hint: string | null,
): string {
  if (!viewerAuthed || reason === "auth_required") {
    return "Sign in to join this discussion.";
  }
  switch (reason) {
    case "comments_disabled":
      return "The validator turned comments off for this announcement.";
    case "announcement_archived":
      return "This announcement is archived — the discussion is read-only.";
    case "announcement_unavailable":
      return "This announcement isn't open for comment.";
    case "suspended":
      return "Your account is suspended, so you can't comment right now.";
    case "fraud_locked":
      return "Your account is temporarily restricted, so you can't comment right now.";
    case "feature_disabled":
      return "Announcement discussions are unavailable right now.";
    default:
      // An unlock hint is server-authored, so prefer it when present.
      return hint ?? "Comments are closed on this announcement.";
  }
}

interface AnnouncementCommentsProps {
  announcementId: string;
  /** Viewer is signed in. Anonymous viewers read but never see a composer. */
  viewerAuthed: boolean;
}

export function AnnouncementComments({
  announcementId,
  viewerAuthed,
}: AnnouncementCommentsProps) {
  const query = useAnnouncementComments(announcementId);
  const create = useCreateAnnouncementComment(announcementId);
  const remove = useRemoveAnnouncementComment(announcementId);
  const [draft, setDraft] = useState("");

  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_forbidden: "This discussion isn't open to you.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
    },
    "Couldn't load this discussion. Try again in a moment.",
  );

  if (query.isError) {
    return (
      <section aria-labelledby="announcement-discussion" className="mt-10">
        <Heading />
        <LoadFailure
          message={failureCopy}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }

  if (query.isPending) {
    return (
      <section aria-labelledby="announcement-discussion" className="mt-10">
        <Heading />
        <div className="flex flex-col gap-2 px-5 py-6 sm:px-8">
          <Skeleton className="h-16" count={3} />
        </div>
      </section>
    );
  }

  const pages = query.data.pages;
  const items: AnnouncementComment[] = pages.flatMap((page) => page.items);

  // ── The comment gate ───────────────────────────────────────────────
  //
  // 🔒 This gate is ANNOUNCEMENT-SPECIFIC. It comes from the
  // `/announcements/:id/comments` response for THIS announcement — never
  // from the validator Card. A page-level "may comment" would authorize
  // commenting on every announcement, including archived ones and ones
  // whose operator switched comments off; `AnnouncementFeatureCapabilities`
  // deliberately has no `can_comment` field so that cannot be wired up
  // by accident.
  //
  // The server resolves it from authentication, member standing,
  // fraud/suspension state, `comments_enabled`, published-and-due state,
  // archived state and the feature switch. The client re-derives none of
  // that — it reads one boolean and renders the reason.
  //
  // Taken from the LAST page so an archive that happened mid-scroll is
  // reflected, rather than the stale value page 1 was built with.
  //
  // Absence FAILS CLOSED: a missing `can_comment`, a missing entry, or a
  // non-`true` value all collapse to false in `isAllowed`, so a backend
  // that omits the field gets a read-only discussion, never an open one.
  const gate = pages[pages.length - 1]?.can_comment;
  const canComment = viewerAuthed && isAllowed({ can_comment: gate }, "can_comment");
  const gateReason = reasonCode({ can_comment: gate }, "can_comment");
  const gateHint = unlockHint({ can_comment: gate }, "can_comment");

  const trimmed = draft.trim();
  const submitBlocked =
    trimmed === "" || trimmed.length > ANNOUNCEMENT_COMMENT_MAX || create.isPending;

  const createCopy = humanizeCode(
    create.error,
    {
      announcement_archived: "This announcement is archived — the discussion is read-only.",
      bcc_forbidden: "You can't comment on this announcement.",
      bcc_invalid_request: `Keep it under ${ANNOUNCEMENT_COMMENT_MAX} characters.`,
      bcc_rate_limited: "Commenting too fast — give it a moment.",
      bcc_unauthorized: "Sign in again to comment.",
    },
    "Couldn't post that comment. Try again in a moment.",
  );

  return (
    <section aria-labelledby="announcement-discussion" className="mt-10">
      <Heading />

      {items.length === 0 ? (
        <div className="px-5 py-10 sm:px-8">
          <p
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            NOTHING SAID YET
          </p>
          <p className="font-serif italic text-bcc-text-secondary" style={{ fontSize: "16px" }}>
            No comments on this announcement yet.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col">
          {items.map((comment) =>
            comment.is_removed ? (
              <CommentTombstone key={comment.id} comment={comment} />
            ) : (
              <li
                key={comment.id}
                className="border-b border-bcc-border px-5 py-4 last:border-b-0 sm:px-8"
                data-testid="announcement-comment"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    avatarUrl={comment.author.avatar_url}
                    handle={comment.author.handle}
                    displayName={comment.author.display_name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="bcc-stencil text-bcc-text" style={{ fontSize: "14px" }}>
                        {comment.author.display_name}
                      </span>
                      <time
                        dateTime={comment.posted_at}
                        title={formatAbsoluteDateTime(comment.posted_at)}
                        className="bcc-mono text-bcc-text-secondary"
                        style={{ fontSize: "11px" }}
                      >
                        {formatShortDate(comment.posted_at)}
                      </time>
                    </div>
                    {/* Plain text — never Markdown, never innerHTML. */}
                    <p
                      className="font-serif text-bcc-text-secondary"
                      style={{ fontSize: "15px", lineHeight: 1.5, whiteSpace: "pre-line" }}
                    >
                      {comment.body}
                    </p>
                    {isAllowed(comment.permissions, "can_remove") && (
                      <button
                        type="button"
                        onClick={() => void remove.mutate({ commentId: comment.id })}
                        disabled={remove.isPending}
                        className="bcc-mono mt-2 text-bcc-text-secondary hover:underline disabled:opacity-50"
                        style={{ fontSize: "11px", minHeight: "44px" }}
                      >
                        REMOVE
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ),
          )}
        </ol>
      )}

      {query.hasNextPage && (
        <div className="px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="bcc-mono text-safety hover:underline disabled:opacity-50"
            style={{ fontSize: "11px", letterSpacing: "0.12em", minHeight: "44px" }}
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        </div>
      )}

      {canComment ? (
        <form
          className="flex flex-col gap-2 px-5 py-6 sm:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (submitBlocked) return;
            create.mutate(
              { body: trimmed },
              { onSuccess: () => setDraft("") },
            );
          }}
        >
          <label htmlFor="announcement-comment-body" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="announcement-comment-body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={ANNOUNCEMENT_COMMENT_MAX}
            rows={3}
            disabled={create.isPending}
            placeholder="Add a comment"
            className="rounded-sm border border-bcc-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text disabled:opacity-50"
          />
          {create.isError && (
            <p role="alert" className="text-bcc-danger" style={{ fontSize: "13px" }}>
              {createCopy}
            </p>
          )}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitBlocked}
              className="bcc-mono rounded-sm border border-bcc-border px-4 py-2 text-bcc-text disabled:cursor-not-allowed disabled:opacity-50"
              style={{ minHeight: "44px", fontSize: "12px" }}
            >
              {create.isPending ? <Spinner size={16} /> : null}
              COMMENT
            </button>
          </div>
        </form>
      ) : (
        /* Visible-but-explained, never silently hidden (§CLAUDE.md). */
        <p
          className="px-5 py-6 font-serif italic text-bcc-text-secondary sm:px-8"
          style={{ fontSize: "15px" }}
          data-testid="announcement-comment-disabled"
        >
          {deniedCopy(viewerAuthed, gateReason, gateHint)}
        </p>
      )}
    </section>
  );
}

function Heading() {
  return (
    <h3
      id="announcement-discussion"
      className="bcc-stencil border-b border-bcc-border px-5 py-4 text-bcc-text sm:px-8"
      style={{ fontSize: "18px" }}
    >
      Discussion
    </h3>
  );
}

/**
 * A removed comment, still in its original position.
 *
 * Renders `label` verbatim — the server authors it and it is the ONLY
 * text this row may show. Deliberately no author, no avatar, no body,
 * no reason: a tombstone that named the commenter would disclose more
 * than showing nothing at all.
 */
function CommentTombstone({
  comment,
}: {
  comment: Extract<AnnouncementComment, { is_removed: true }>;
}) {
  return (
    <li
      className="border-b border-bcc-border px-5 py-4 last:border-b-0 sm:px-8"
      data-testid="announcement-comment-tombstone"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-serif italic text-bcc-text-secondary" style={{ fontSize: "14px" }}>
          {comment.label}
        </span>
        <time
          dateTime={comment.removed_at}
          title={formatAbsoluteDateTime(comment.removed_at)}
          className="bcc-mono text-bcc-text-secondary"
          style={{ fontSize: "11px" }}
        >
          {formatShortDate(comment.removed_at)}
        </time>
      </div>
    </li>
  );
}
