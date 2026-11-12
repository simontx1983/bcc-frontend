"use client";

/**
 * ThreadView — chat-style message bubbles for a single conversation.
 *
 * Bubble alignment:
 *   - Authored by the viewer → right-aligned cardstock-edge bubble
 *   - Authored by anyone else → left-aligned cardstock-deep bubble
 *   - `is_inline_notice === true` → centered austere mono line, no
 *     avatar, no bubble (PeepSo system events: "X joined", "Y left")
 *
 * Messages from senders the viewer has blocked (bcc-trust #122) render
 * collapsed. The ONLY predicate is the server's `sender_blocked_by_viewer`
 * flag — never inferred from anything else. Consecutive flagged messages
 * group into one collapsed row; "Show" reveals the whole run in place via
 * `useRevealBlockedMessages`. Reveal state is local and ephemeral: reload
 * collapses again, and nothing is unblocked or persisted. Inline notices
 * are never collapsed.
 *
 * Auto-scrolls to bottom on initial render and on new server messages.
 * Respects `prefers-reduced-motion`: skips smooth scroll when the OS
 * setting is on.
 */

import { memo, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRevealBlockedMessages } from "@/hooks/useRevealBlockedMessages";
import { humanizeCode, isNonRetryableFixedReadFailure } from "@/lib/api/errors";
import {
  BLOCKED_SENDER_PLACEHOLDER,
  type MessageItem,
  type MessageUserMini,
} from "@/lib/api/types";

interface ThreadViewProps {
  conversationId: number;
  items: MessageItem[];
  viewerId: number | null;
  /**
   * The element to bring into view with the newest message — the page
   * passes the composer's wrapper so a reply box is never scrolled below
   * the fold. Falls back to the end of the thread.
   */
  bottomAnchorRef?: RefObject<HTMLElement | null>;
}

type ThreadSegment =
  | { kind: "message"; msg: MessageItem }
  | { kind: "blocked"; msgs: MessageItem[] };

/**
 * Fold consecutive flagged messages into one `blocked` segment. Any
 * unflagged message or inline notice ends the run, so a run broken by a
 * normal message forms two groups.
 */
function segmentThread(items: readonly MessageItem[]): ThreadSegment[] {
  const out: ThreadSegment[] = [];
  for (const msg of items) {
    if (msg.sender_blocked_by_viewer && !msg.is_inline_notice) {
      const last = out[out.length - 1];
      if (last !== undefined && last.kind === "blocked") last.msgs.push(msg);
      else out.push({ kind: "blocked", msgs: [msg] });
    } else {
      out.push({ kind: "message", msg });
    }
  }
  return out;
}

/** Within this many px of the bottom counts as "reading the latest". */
const NEAR_BOTTOM_PX = 240;

function isNearPageBottom(): boolean {
  if (typeof window === "undefined") return true;
  const doc = document.documentElement;
  return doc.scrollHeight - (window.scrollY + window.innerHeight) < NEAR_BOTTOM_PX;
}

export function ThreadView({ conversationId, items, viewerId, bottomAnchorRef }: ThreadViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const endRef = useRef<HTMLDivElement | null>(null);
  const prevLastIdRef = useRef<number | null>(null);
  const segments = useMemo(() => segmentThread(items), [items]);

  // Where the reader was BEFORE new messages rendered: measured on scroll,
  // because by the time the effect below runs the page has already grown.
  const nearBottomRef = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      nearBottomRef.current = isNearPageBottom();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bring the newest message into view — together with the composer
  // below it (bottomAnchorRef), not just the last bubble, which used to
  // push the composer below the fold (UX scan H12). Only on first load,
  // for the viewer's own message, or when the reader was already at the
  // bottom: someone scrolled up to read history is never yanked down by
  // a polled message. The initial scroll is instant (no page-load lurch);
  // later ones honour reduced motion.
  useEffect(() => {
    if (items.length === 0) return;
    const last = items[items.length - 1];
    const lastId = last?.id ?? null;
    const isInitial = prevLastIdRef.current === null;
    const grew = !isInitial && lastId !== prevLastIdRef.current;
    const mine = last !== undefined && isMine(last, viewerId);

    if (isInitial || (grew && (mine || nearBottomRef.current))) {
      (bottomAnchorRef?.current ?? endRef.current)?.scrollIntoView({
        behavior: isInitial || reducedMotion ? "auto" : "smooth",
        block: "end",
      });
      nearBottomRef.current = true;
    }
    prevLastIdRef.current = lastId;
  }, [items, reducedMotion, viewerId, bottomAnchorRef]);

  if (items.length === 0) {
    return (
      <div className="bcc-paper p-6 text-center">
        <p className="bcc-mono text-ink-soft">No messages yet — say hi.</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      {segments.map((seg) => {
        if (seg.kind === "blocked") {
          // Keyed on the run's first message so reveal state survives a
          // refetch that appends to the same run.
          return (
            <BlockedRun
              key={`blocked-${seg.msgs[0]?.id ?? 0}`}
              conversationId={conversationId}
              msgs={seg.msgs}
              viewerId={viewerId}
            />
          );
        }
        const msg = seg.msg;
        if (msg.is_inline_notice) {
          return (
            <p
              key={msg.id}
              className="bcc-mono mx-auto text-center text-[10px] tracking-[0.18em] text-bcc-text-secondary"
            >
              {stripHtml(msg.body)}
            </p>
          );
        }
        return (
          <Bubble key={msg.id} msg={msg} isMine={isMine(msg, viewerId)} />
        );
      })}
      <div ref={endRef} aria-hidden />
    </div>
  );
}

function isMine(msg: MessageItem, viewerId: number | null): boolean {
  return viewerId !== null && msg.author?.id === viewerId;
}

function Bubble({
  msg,
  isMine,
  body = msg.body,
}: {
  msg: MessageItem;
  isMine: boolean;
  /** Overrides `msg.body` — a revealed blocked-sender message. */
  body?: string;
}) {
  const author = msg.author;
  const authorName = nameOf(author);

  return (
    <div
      className={
        "flex gap-2 " + (isMine ? "flex-row-reverse" : "flex-row")
      }
    >
      <Avatar
        avatarUrl={author?.avatar_url ?? null}
        handle={author?.handle ?? ""}
        displayName={author?.display_name}
        size="sm"
        variant="rounded"
      />
      <div
        className={
          "flex max-w-[80%] flex-col gap-1 " +
          (isMine ? "items-end" : "items-start")
        }
      >
        {!isMine && authorName !== "" && (
          <span className="bcc-mono px-1 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
            {authorName}
          </span>
        )}
        <div
          className={
            "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words " +
            (isMine
              ? "bg-cardstock text-ink"
              : "border border-bcc-border bg-bcc-surface-raised text-bcc-text")
          }
        >
          {stripHtml(body)}
        </div>
        <MessageTime iso={msg.posted_at} />
      </div>
    </div>
  );
}

function MessageTime({ iso }: { iso: string }) {
  return (
    <time
      dateTime={iso}
      className="bcc-mono px-1 text-[9px] tracking-[0.16em] text-bcc-text-secondary"
      suppressHydrationWarning
    >
      {formatTime(iso)}
    </time>
  );
}

/**
 * One collapsed row for a run of consecutive messages whose sender the
 * viewer has blocked.
 *
 *   - 1 message  → "Message from someone you have blocked"
 *   - N, one sender → "N messages from someone you have blocked"
 *   - N, several senders → "N messages from people you have blocked",
 *     labelled with the first sender plus a count of the others.
 *
 * The avatar is the run's first sender; the time is that message's, or a
 * first – last span for a run. "Show" resolves every body in the run and
 * reveals them in place as normal bubbles under a "Hide" bar. A failed
 * reveal leaves the row collapsed with an inline error.
 */
const BlockedRun = memo(function BlockedRun({
  conversationId,
  msgs,
  viewerId,
}: {
  conversationId: number;
  msgs: MessageItem[];
  viewerId: number | null;
}) {
  const [requested, setRequested] = useState(false);
  const regionId = useId();
  const summaryId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const refocusToggle = useRef(false);

  const reveal = useRevealBlockedMessages(conversationId, msgs, requested);
  const expanded = requested && reveal.bodies !== null;

  // The toggle moves between the collapsed row and the expanded bar;
  // keep keyboard focus on it across that swap.
  useEffect(() => {
    if (!refocusToggle.current) return;
    refocusToggle.current = false;
    toggleRef.current?.focus();
  }, [expanded]);

  const count = msgs.length;
  const first = msgs[0];
  const last = msgs[count - 1];
  if (first === undefined || last === undefined) return null;

  const senders = distinctSenders(msgs);
  const summary =
    count === 1
      ? BLOCKED_SENDER_PLACEHOLDER
      : `${count} messages from ${senders.length > 1 ? "people" : "someone"} you have blocked`;
  const senderLabel = senderLabelOf(senders);
  const showLabel = count === 1 ? "Show message" : `Show ${count} messages`;
  const hideLabel = count === 1 ? "Hide message" : `Hide ${count} messages`;

  // A reveal that failed in a way no retry can fix (404, 403) is a dead
  // end: the toggle goes inert rather than re-requesting on every tap.
  const deadEnd =
    requested && reveal.error !== null && isNonRetryableFixedReadFailure(reveal.error);

  const onToggle = () => {
    // aria-disabled rather than `disabled`, so focus isn't dropped while
    // a reveal is in flight or after a dead end.
    if (reveal.isLoading || deadEnd) return;
    refocusToggle.current = true;
    if (expanded) {
      setRequested(false);
    } else if (requested && reveal.error !== null) {
      reveal.retry();
    } else {
      setRequested(true);
    }
  };

  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={regionId}
      aria-disabled={reveal.isLoading || deadEnd}
      className={
        "bcc-mono inline-flex min-h-[44px] items-center text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary underline-offset-2 transition hover:text-bcc-text hover:underline aria-disabled:opacity-50 " +
        (reveal.isLoading ? "cursor-wait" : deadEnd ? "cursor-not-allowed" : "")
      }
    >
      {expanded ? hideLabel : showLabel}
    </button>
  );

  const region = (
    <div
      id={regionId}
      hidden={!expanded}
      className="flex flex-col gap-3 motion-safe:[animation:bcc-fade-in_0.15s_ease_forwards]"
    >
      {expanded &&
        msgs.map((msg) => (
          <Bubble
            key={msg.id}
            msg={msg}
            isMine={isMine(msg, viewerId)}
            body={reveal.bodies?.get(msg.id) ?? ""}
          />
        ))}
    </div>
  );

  if (expanded) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 border-b border-dashed border-bcc-border">
          <span className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary">
            {summary}
          </span>
          {toggle}
        </div>
        {region}
      </div>
    );
  }

  const error = requested ? reveal.error : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-labelledby={summaryId} className="flex flex-row gap-2">
        <Avatar
          avatarUrl={first.author?.avatar_url ?? null}
          handle={first.author?.handle ?? ""}
          displayName={first.author?.display_name}
          size="sm"
          variant="rounded"
        />
        <div className="flex min-w-0 max-w-[80%] flex-col items-start gap-1">
          {senderLabel !== "" && (
            <span className="bcc-mono px-1 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
              {senderLabel}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 rounded-sm border border-dashed border-bcc-border px-3">
            <p id={summaryId} className="py-2 font-serif text-sm italic text-bcc-text-secondary">
              {summary}
            </p>
            {toggle}
            {reveal.isLoading && (
              <Spinner size={14} className="text-bcc-text-secondary" />
            )}
          </div>
          <span className="flex items-center gap-1">
            <MessageTime iso={first.posted_at} />
            {count > 1 && formatTime(last.posted_at) !== formatTime(first.posted_at) && (
              <>
                <span aria-hidden className="bcc-mono text-[9px] text-bcc-text-secondary">–</span>
                <MessageTime iso={last.posted_at} />
              </>
            )}
          </span>
          {error !== null && (
            <div className="flex flex-wrap items-center gap-x-3 px-1">
              <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
                {/* §γ — copy is keyed on err.code; never render err.message. */}
                {humanizeCode(
                  error,
                  {
                    bcc_not_found: "This message is no longer available.",
                    bcc_unauthorized:
                      "Your session expired — sign in again to show this message.",
                    bcc_rate_limited:
                      "Too many requests — try again in a moment.",
                  },
                  "Couldn't show this message. Try again in a moment.",
                )}
              </p>
              {!isNonRetryableFixedReadFailure(error) && (
                <button
                  type="button"
                  // In-flight guard: React Query v5 keeps `error` set while
                  // a refetch runs, so the button stays up during a retry.
                  onClick={() => {
                    if (!reveal.isLoading) reveal.retry();
                  }}
                  aria-disabled={reveal.isLoading}
                  className="bcc-mono inline-flex min-h-[44px] items-center text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary transition hover:text-bcc-text hover:underline aria-disabled:cursor-wait aria-disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {region}
    </div>
  );
});

function nameOf(user: MessageUserMini | null): string {
  if (user === null) return "";
  return user.display_name !== "" ? user.display_name : user.handle;
}

function distinctSenders(msgs: readonly MessageItem[]): MessageUserMini[] {
  const seen = new Set<number>();
  const out: MessageUserMini[] = [];
  for (const msg of msgs) {
    if (msg.author === null || seen.has(msg.author.id)) continue;
    seen.add(msg.author.id);
    out.push(msg.author);
  }
  return out;
}

/** First sender's name, plus a count of the others when there are several. */
function senderLabelOf(senders: readonly MessageUserMini[]): string {
  const first = senders[0];
  if (first === undefined) return "";
  const name = nameOf(first);
  const others = senders.length - 1;
  if (others === 0) return name;
  return `${name} + ${others} ${others === 1 ? "other" : "others"}`;
}

/**
 * PeepSo stores message bodies in `wp_posts.post_content`, which can
 * contain filtered HTML. The server preview is plain text already;
 * full bodies aren't stripped on the wire. Strip here so a stray
 * `<a>` from a paste doesn't render unexpectedly.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function formatTime(iso: string): string {
  if (iso === "") return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
