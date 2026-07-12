"use client";

/**
 * Lightbox — theater-mode media viewer for feed media (photo/gif).
 *
 * Built on the shared `Dialog` primitive (ESC / backdrop-click / focus
 * trap / body-scroll-lock / portal come for free) with a darker, heavier
 * backdrop so the image reads as a full-bleed theater rather than a
 * floating card.
 *
 * Layout is post-aware — it takes the whole `FeedItem`, not just a URL,
 * so the viewer keeps the post's context alongside the image:
 *
 *   Desktop (md+): a two-pane theater — image on the left, a live
 *   comments/reactions rail on the right (Facebook-style). The image
 *   shows instantly; comments stream in behind `CommentDrawer`'s own
 *   skeleton so the panel never blocks the picture.
 *
 *   Mobile (<md): the image owns the screen (checking the image is the
 *   point). A compact action bar carries Stoke + Share, and a "comments"
 *   affordance — tap it or swipe up — hands off to the full `/post/[id]`
 *   detail view scrolled to the thread, instead of cramming a side panel
 *   onto a phone.
 *
 * Reactivity: reads the post back through `useFeedItem` (seeded by the
 * `item` passed in) so the in-frame Stoke rail is live and stays in sync
 * with the feed row and the detail view — the same cache all three share.
 */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Dialog } from "@/components/ui/Dialog";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { ReactionRail } from "@/components/feed/ReactionRail";
import { ShareButton } from "@/components/feed/ShareButton";
import { readString } from "@/components/feed/postBody";
import { useFeedItem } from "@/hooks/useFeed";
import { formatRelativeTime } from "@/lib/format";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

/** Min upward travel (px) for a mobile swipe-up to open comments. */
const SWIPE_UP_THRESHOLD = 60;

export function Lightbox({
  item: initialItem,
  src,
  alt,
  onClose,
}: {
  item: FeedItem;
  src: string;
  alt: string;
  onClose: () => void;
}) {
  // Reactive read seeded by the passed item — keeps the in-frame Stoke
  // rail live and shared with the feed/detail caches. See #5.
  const item = useFeedItem(initialItem.id, initialItem).data;
  const router = useRouter();

  const selfHref = item.links.self as Route;
  const caption = readString(item.body, "caption");
  const mentions = readMentions(item.body);
  const commentCount = item.comment_count ?? 0;
  const shareTitle = `${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`;

  // Mobile hand-off: the phone doesn't cram a side panel — it opens the
  // full detail view scrolled to the thread (intent=comment).
  const openComments = () => {
    router.push(`${selfHref}?intent=comment` as Route);
    onClose();
  };

  const touchStartY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    const end = e.changedTouches[0]?.clientY ?? null;
    touchStartY.current = null;
    if (start !== null && end !== null && start - end > SWIPE_UP_THRESHOLD) {
      openComments();
    }
  };

  return (
    <Dialog
      title={alt !== "" ? alt : "Photo"}
      bare
      center
      backdropClassName="bg-ink/90 backdrop-blur-md"
      onClose={onClose}
      panelClassName="flex h-[92vh] max-h-none w-full max-w-6xl overflow-hidden rounded-2xl"
    >
      {/* ── Image pane ─────────────────────────────────────────────── */}
      <div
        className="relative flex flex-1 items-center justify-center bg-ink"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/60 text-lg text-paper backdrop-blur-sm transition-colors hover:bg-ink"
        >
          ✕
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element -- remote feed media, no per-tenant remotePatterns allow-list */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />

        {/* Mobile action bar — Stoke + Share inline, comments hand off to
            the detail view. Hidden on md+ where the side panel takes over. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-8 md:hidden">
          <ReactionRail item={item} />
          <button
            type="button"
            onClick={openComments}
            className="bcc-mono inline-flex items-center gap-1.5 rounded-full bg-ink/60 px-3 py-1.5 text-[12px] text-paper backdrop-blur-sm"
            aria-label={`View ${commentCount} comments`}
          >
            <CommentGlyph />
            <span>{commentCount}</span>
            <span className="ml-0.5 opacity-70">↑ comments</span>
          </button>
          <ShareButton selfHref={selfHref} shareTitle={shareTitle} />
        </div>
      </div>

      {/* ── Desktop comments/reactions panel ───────────────────────── */}
      <aside className="hidden w-[360px] shrink-0 flex-col border-l border-[var(--bcc-border)] bg-[var(--bcc-surface)] md:flex">
        <header className="border-b border-[var(--bcc-border-light)] p-4">
          <AuthorBadge
            author={item.author}
            size="md"
            avatarRingColor="var(--bcc-accent)"
            trailing={
              <time
                dateTime={item.posted_at}
                className="bcc-mono shrink-0 text-[11px] text-[var(--bcc-text-secondary)]/70"
              >
                {formatRelativeTime(item.posted_at)}
              </time>
            }
          />
          {caption !== null && (
            <p className="mt-3 font-serif text-[var(--bcc-text)] whitespace-pre-line">
              {renderTextWithMentions(caption, mentions)}
            </p>
          )}
        </header>

        <div className="flex items-center justify-between gap-3 border-b border-[var(--bcc-border-light)] px-4 py-2.5">
          <ReactionRail item={item} />
          <ShareButton selfHref={selfHref} shareTitle={shareTitle} />
        </div>

        {/* Comments scroll independently; CommentDrawer owns its own
            loading skeleton so the image never waits on the thread. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <CommentDrawer feedId={item.id} isOpen />
        </div>
      </aside>
    </Dialog>
  );
}

function CommentGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
