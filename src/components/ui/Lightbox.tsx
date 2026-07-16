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
 * so the viewer keeps the post's context alongside the image. A single
 * `CommentDrawer` mount is repositioned by CSS rather than duplicated —
 * two live instances would double-fetch the thread and collide on the
 * composer's DOM id:
 *
 *   Desktop (md+): a two-pane theater — image on the left, a live
 *   comments/reactions rail on the right (Facebook-style). The image
 *   shows instantly; comments stream in behind `CommentDrawer`'s own
 *   skeleton so the panel never blocks the picture.
 *
 *   Mobile (<md): the whole dialog panel scrolls vertically — the image
 *   fills the opening view, and scrolling up reveals the same comments
 *   block beneath it (sheet-style), instead of handing off to
 *   `/post/[id]`. The Comment pill in the action bar is the discoverable
 *   jump-to-thread affordance (native scroll already does the rest, so
 *   no bespoke swipe-gesture handling is needed).
 *
 * Action rail: both the mobile overlay bar and the desktop strip render
 * the shared `PostActionBar` (not a hand-assembled rail) so the lightbox
 * can't drift from the feed/detail height or grammar — see Item 9/11b.
 * The mobile bar sits over dark theater chrome (not the page's live
 * theme), so it's `data-theme="dark"` scoped: PostActionBar's `--bcc-*`
 * tokens need to resolve to their dark values there regardless of the
 * site's actual light/dark setting, same as the old hardcoded
 * `text-paper`/`bg-ink` treatment did implicitly.
 *
 * Reactivity: reads the post back through `useFeedItem` (seeded by the
 * `item` passed in) so the in-frame Stoke rail is live and stays in sync
 * with the feed row and the detail view — the same cache all three share.
 */

import { Dialog } from "@/components/ui/Dialog";
import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { PostActionBar } from "@/components/feed/PostActionBar";
import { readString } from "@/components/feed/postBody";
import { useFeedItem } from "@/hooks/useFeed";
import { formatRelativeTime } from "@/lib/format";
import { readMentions, renderTextWithMentions } from "@/lib/format/mentions";
import type { FeedItem } from "@/lib/api/types";

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

  const caption = readString(item.body, "caption");
  const mentions = readMentions(item.body);
  const commentCount = item.comment_count ?? 0;
  const shareTitle = `${item.author.display_name ?? item.author.handle} on Blue Collar Crypto`;

  // Same jump-to-composer behavior on both surfaces — there's only ever
  // one CommentDrawer mount, CSS just repositions it (see doc comment).
  const scrollToComments = () => {
    const el = document.getElementById(`comment-${item.id}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLTextAreaElement | null)?.focus();
  };

  return (
    <Dialog
      title={alt !== "" ? alt : "Photo"}
      bare
      center
      backdropClassName="bg-ink/90 backdrop-blur-md"
      onClose={onClose}
      panelClassName="flex h-[92vh] max-h-none w-full max-w-6xl flex-col overflow-y-auto rounded-2xl md:flex-row md:overflow-hidden"
    >
      {/* ── Image pane ─────────────────────────────────────────────── */}
      <div className="relative flex min-h-[70vh] shrink-0 items-center justify-center bg-ink md:min-h-0 md:flex-1">
        {/* fixed (mobile) so it survives the panel's own scroll once the
            user has scrolled up into the comments sheet; absolute (desktop)
            matches the pre-existing pane-relative placement, unchanged
            there since desktop never scrolls the image out of view. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="fixed right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/60 text-lg text-paper backdrop-blur-sm transition-colors hover:bg-ink md:absolute"
        >
          ✕
        </button>

        {/* eslint-disable-next-line @next/next/no-img-element -- remote feed media, no per-tenant remotePatterns allow-list */}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />

        {/* Mobile action bar — the shared rail, dark-theme-scoped since it
            sits over theater chrome, not the page's live theme. Hidden on
            md+ where the side panel's own strip takes over. */}
        <div
          data-theme="dark"
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-4 pt-8 md:hidden"
        >
          <PostActionBar
            item={item}
            commentCount={commentCount}
            onComment={scrollToComments}
            commentTitle="Jump to comments"
            shareTitle={shareTitle}
          />
        </div>
      </div>

      {/* ── Comments/reactions panel — one block, repositioned by CSS: a
          full-width sheet below the image on mobile (the whole dialog
          panel scrolls, so scrolling up reveals it — no swipe-gesture
          plumbing needed), a fixed-width side aside on desktop. ── */}
      <div className="flex flex-col border-t border-[var(--bcc-border)] bg-[var(--bcc-surface)] md:w-[360px] md:shrink-0 md:border-l md:border-t-0">
        <header className="hidden border-b border-[var(--bcc-border-light)] p-4 md:block">
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
            <p className="mt-3 font-serif text-[var(--bcc-text)] whitespace-pre-line break-words">
              {renderTextWithMentions(caption, mentions)}
            </p>
          )}
        </header>

        <div className="hidden items-center justify-between gap-3 border-b border-[var(--bcc-border-light)] px-4 py-1.5 md:flex">
          <PostActionBar
            item={item}
            commentCount={commentCount}
            onComment={scrollToComments}
            commentTitle="Jump to comments"
            shareTitle={shareTitle}
          />
        </div>

        {/* Desktop: scrolls independently within its fixed-height column.
            Mobile: natural flow — the outer dialog panel is the one
            scroll container. CommentDrawer owns its own loading skeleton
            so the image never waits on the thread. */}
        <div className="p-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <CommentDrawer feedId={item.id} isOpen topDivider={false} />
        </div>
      </div>
    </Dialog>
  );
}
