"use client";

/**
 * PostedNotice — the "Posted — View post" confirmation after a post
 * goes up (F-258 M6, F-494).
 *
 * Shared by every surface a post can be written from:
 *   - the inline composer, under its card (`variant="inline"`);
 *   - NewPostTrigger, whose Dialog closes on success and so unmounts the
 *     composer's own line (`variant="floating"`, dismissible);
 *   - ReviewCallout, whose review modal can also post a status from its
 *     Status tab (`variant="inline"`, under the WRITE A REVIEW button).
 *
 * The live region is mounted EMPTY with its host and filled per post
 * with a fresh `<span key={seq}>`, so a second post is announced too
 * (#328's rule; the CardActionBar PillNoticeLine pattern). A host renders
 * it straight after the control that focus returns to, so the next Tab
 * reaches "View post".
 *
 * The link is `/post/{act_id}`: the numeric permalink the /post/[id]
 * page serves. The `feed_<n>` wire id matches no GET /feed/{id} route.
 */

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { HIT_AREA_44 } from "@/components/feed/hitArea";

export const POSTED_COPY = "Posted";
export const VIEW_POST_COPY = "View post";
export const DISMISS_POSTED_COPY = "Dismiss";

/** One successful post. `seq` makes each post a fresh announcement. */
export interface PostedEvent {
  readonly seq: number;
  /** The new post's activity id, or null when there is no usable one (no link). */
  readonly actId: number | null;
}

/** The latest post, plus `record` (one per successful post) and `clear`. */
export function usePostedEvent() {
  const [posted, setPosted] = useState<PostedEvent | null>(null);
  const seq = useRef(0);
  const record = useCallback((actId: number | null) => {
    seq.current += 1;
    setPosted({ seq: seq.current, actId });
  }, []);
  const clear = useCallback(() => setPosted(null), []);
  return { posted, record, clear };
}

interface PostedNoticeProps {
  posted: PostedEvent | null;
  /**
   * "inline" (default): a line in the host's flow.
   * "floating": a small notice fixed above the mobile bottom nav (bottom
   * centre on desktop), placed like UndoToast and the consent banner.
   */
  variant?: "inline" | "floating";
  /** Floating only: shows a dismiss (×) button that calls this. */
  onDismiss?: () => void;
  /** Extra classes for the inline line (e.g. the host's gutter). */
  className?: string;
}

export function PostedNotice({ posted, variant = "inline", onDismiss, className }: PostedNoticeProps) {
  const line = (
    <p
      role="status"
      className={
        "bcc-mono text-[11px] text-[var(--bcc-text-secondary)]" + (className !== undefined ? ` ${className}` : "")
      }
    >
      {posted !== null && (
        <span key={posted.seq} className={variant === "inline" ? "block pt-2" : "block"}>
          {POSTED_COPY}
          {posted.actId !== null && (
            <>
              {" — "}
              <Link
                href={`/post/${posted.actId}` as Route}
                className="text-blueprint underline-offset-2 hover:underline"
              >
                {VIEW_POST_COPY}
              </Link>
            </>
          )}
        </span>
      )}
    </p>
  );

  if (variant === "inline") return line;

  // The wrapper stays mounted (so the region inside does too) and only
  // takes up space and paints once there is something to say.
  return (
    <div
      className={
        posted !== null
          ? "bcc-panel pointer-events-auto fixed bottom-[calc(var(--bcc-mobile-nav-total-h)+16px)] left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 py-2 pl-4 pr-2 shadow-2xl md:bottom-6"
          : "fixed"
      }
    >
      {line}
      {posted !== null && onDismiss !== undefined && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={DISMISS_POSTED_COPY}
          title={DISMISS_POSTED_COPY}
          className={`${HIT_AREA_44} bcc-mono inline-flex h-7 w-7 items-center justify-center rounded-full text-[14px] leading-none text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]`}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}
