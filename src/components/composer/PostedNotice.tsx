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
 *
 * F-514: the floating panel now renders through the shared BottomSlot
 * (portaled to document.body, stacked with the other bottom-centre
 * surfaces, and outside the desktop sidebar's stacking context). A portal
 * puts the panel at the END of the document for Tab order, so:
 *  - the live region stays in place, sr-only, right after the trigger, so
 *    the announcement doesn't move;
 *  - a focus bridge keeps the keyboard path of #368. While the notice
 *    shows, Tab from the trigger goes to "View post"; Shift+Tab from the
 *    panel's first control goes back to the trigger; Tab past its last
 *    control (×) goes to whatever followed the trigger in the page.
 */

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { HIT_AREA_44 } from "@/components/feed/hitArea";
import { BOTTOM_SLOT_HOST_ID, BottomSlot } from "@/components/ui/BottomSlot";
import { FOCUSABLE } from "@/components/ui/Dialog";

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
   * "floating": a small notice in the shared BottomSlot (above the mobile
   * bottom nav, bottom centre on desktop), stacked with UndoToast, the
   * consent banner and the others.
   */
  variant?: "inline" | "floating";
  /** Floating only: shows a dismiss (×) button that calls this. */
  onDismiss?: () => void;
  /**
   * Floating only: the control the notice follows (the "+ New Post"
   * button), for the focus bridge. Tab from it reaches "View post".
   */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Extra classes for the inline line (e.g. the host's gutter). */
  className?: string;
}

export function PostedNotice(props: PostedNoticeProps) {
  return props.variant === "floating" ? <FloatingPostedNotice {...props} /> : <InlinePostedNotice {...props} />;
}

function InlinePostedNotice({ posted, className }: PostedNoticeProps) {
  return (
    <p
      role="status"
      className={
        "bcc-mono text-[11px] text-[var(--bcc-text-secondary)]" + (className !== undefined ? ` ${className}` : "")
      }
    >
      {posted !== null && (
        <span key={posted.seq} className="block pt-2">
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

}

/** The tabbable controls in `root`, in order. */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Focus the first control after `anchor` in the page that really takes
 * focus. Skips the bottom slot (where the panel lives) and inert content.
 * Focus is the visibility test: a display:none control refuses it.
 */
function focusNextAfter(anchor: HTMLElement): boolean {
  const host = document.getElementById(BOTTOM_SLOT_HOST_ID);
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (host?.contains(el) === true || el.closest("[inert]") !== null) continue;
    if (!(anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    el.focus();
    if (document.activeElement === el) return true;
  }
  return false;
}

function FloatingPostedNotice({ posted, onDismiss, triggerRef }: PostedNoticeProps) {
  const anchorRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showing = posted !== null;

  // Tab from the trigger → the panel's first control ("View post").
  useEffect(() => {
    const trigger = triggerRef?.current;
    if (!showing || trigger == null) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || event.shiftKey) return;
      const first = panelRef.current !== null ? focusablesIn(panelRef.current)[0] : undefined;
      if (first === undefined) return;
      event.preventDefault();
      first.focus();
    };
    trigger.addEventListener("keydown", onKey);
    return () => trigger.removeEventListener("keydown", onKey);
  }, [showing, triggerRef]);

  // Inside the panel: Shift+Tab off the first control → the trigger; Tab
  // off the last → what followed the trigger in the page.
  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || panelRef.current === null) return;
    const items = focusablesIn(panelRef.current);
    const active = document.activeElement;
    if (event.shiftKey && active === items[0] && triggerRef?.current != null) {
      event.preventDefault();
      triggerRef.current.focus();
    } else if (!event.shiftKey && active === items[items.length - 1] && anchorRef.current !== null) {
      if (focusNextAfter(anchorRef.current)) event.preventDefault();
    }
  };

  return (
    <>
      {/* In place, right after the trigger: the announcement. */}
      <p ref={anchorRef} role="status" className="sr-only">
        {posted !== null && (
          <span key={posted.seq}>
            {POSTED_COPY}
            {posted.actId !== null && ` — ${VIEW_POST_COPY}`}
          </span>
        )}
      </p>
      {posted !== null && (
        <BottomSlot>
          <div
            ref={panelRef}
            onKeyDown={onPanelKeyDown}
            className="bcc-panel pointer-events-auto flex w-max max-w-[calc(100vw-2rem)] items-center gap-3 py-2 pl-4 pr-2 shadow-2xl"
          >
            <p className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">
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
            </p>
            {onDismiss !== undefined && (
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
        </BottomSlot>
      )}
    </>
  );
}
