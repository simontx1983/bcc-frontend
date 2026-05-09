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
 * Auto-scrolls to bottom on initial render and on new server messages.
 * Respects `prefers-reduced-motion`: skips smooth scroll when the OS
 * setting is on.
 */

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { MessageItem } from "@/lib/api/types";

interface ThreadViewProps {
  items: MessageItem[];
  viewerId: number | null;
}

export function ThreadView({ items, viewerId }: ThreadViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const endRef = useRef<HTMLDivElement | null>(null);
  const prevLastIdRef = useRef<number | null>(null);

  // Auto-scroll to bottom when the list grows (new tail). On the
  // initial mount we skip the smooth animation (would feel like a
  // jarring page-load lurch); on subsequent appends we honor reduced-
  // motion.
  useEffect(() => {
    if (items.length === 0) return;
    const lastId = items[items.length - 1]?.id ?? null;
    const isInitial = prevLastIdRef.current === null;
    const grew = !isInitial && lastId !== prevLastIdRef.current;

    if (isInitial || grew) {
      endRef.current?.scrollIntoView({
        behavior: isInitial || reducedMotion ? "auto" : "smooth",
        block: "end",
      });
    }
    prevLastIdRef.current = lastId;
  }, [items, reducedMotion]);

  if (items.length === 0) {
    return (
      <div className="bcc-paper p-6 text-center">
        <p className="bcc-mono text-cardstock-deep">No messages yet — say hi.</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((msg) => {
        if (msg.is_inline_notice) {
          return (
            <p
              key={msg.id}
              className="bcc-mono mx-auto text-center text-[10px] tracking-[0.18em] text-cardstock-deep/60"
            >
              {stripHtml(msg.body)}
            </p>
          );
        }
        const isMine = viewerId !== null && msg.author?.id === viewerId;
        return (
          <Bubble key={msg.id} msg={msg} isMine={isMine} />
        );
      })}
      <div ref={endRef} aria-hidden />
    </div>
  );
}

function Bubble({ msg, isMine }: { msg: MessageItem; isMine: boolean }) {
  const author = msg.author;
  const authorName = author === null
    ? ""
    : author.display_name !== ""
      ? author.display_name
      : author.handle;

  return (
    <div
      className={
        "flex gap-2 " + (isMine ? "flex-row-reverse" : "flex-row")
      }
    >
      <Avatar src={author?.avatar_url ?? ""} initial={authorName.slice(0, 1).toUpperCase()} />
      <div
        className={
          "flex max-w-[80%] flex-col gap-1 " +
          (isMine ? "items-end" : "items-start")
        }
      >
        {!isMine && authorName !== "" && (
          <span className="bcc-mono px-1 text-[10px] tracking-[0.16em] text-cardstock-deep/70">
            {authorName}
          </span>
        )}
        <div
          className={
            "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words " +
            (isMine
              ? "bg-cardstock text-ink"
              : "bg-cardstock-deep/40 text-cardstock")
          }
        >
          {stripHtml(msg.body)}
        </div>
        <time
          dateTime={msg.posted_at}
          className="bcc-mono px-1 text-[9px] tracking-[0.16em] text-cardstock-deep/50"
          suppressHydrationWarning
        >
          {formatTime(msg.posted_at)}
        </time>
      </div>
    </div>
  );
}

function Avatar({ src, initial }: { src: string; initial: string }) {
  if (src === "") {
    return (
      <span
        aria-hidden
        className="bcc-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cardstock-deep text-xs text-cardstock"
      >
        {initial}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded-full object-cover"
      loading="lazy"
    />
  );
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
