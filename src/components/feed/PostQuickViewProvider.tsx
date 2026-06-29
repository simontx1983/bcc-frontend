"use client";

/**
 * PostQuickViewProvider — in-feed "quick view" of a post, opened by
 * clicking a feed card (or its comment chip).
 *
 * Replaces the old `@modal/(.)post/[id]` intercepting-route modal, which
 * crashed Next 15.5's client router (`initialTree is not iterable` in
 * apply-router-state-patch-to-tree on every soft-nav to /post/[id]). The
 * permalink page `/post/[id]` stays as the source of truth for hard-nav,
 * SEO/OG, and shared links; this just renders the SAME `PostDetail` over
 * the feed without a route change — so the feed never unmounts and
 * closing returns to the exact scroll position instantly.
 *
 * The card already has the full `FeedItem`, so we open from that object —
 * no fetch, no loading state. Comments load lazily inside `CommentDrawer`
 * keyed by `item.id`, exactly as on the permalink page.
 *
 * Back-button behavior: opening pushes a throwaway history entry so the
 * browser Back button / Android back gesture closes the quick view
 * instead of leaving the feed; navigating via any in-modal link closes it
 * (pathname effect) so the overlay never strands over a new page.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { Dialog } from "@/components/ui/Dialog";
import { PostDetail } from "@/components/feed/PostDetail";
import type { FeedItem } from "@/lib/api/types";

interface QuickViewState {
  item: FeedItem;
  focusComposer: boolean;
}

interface PostQuickViewContextValue {
  open: (item: FeedItem, opts?: { focusComposer?: boolean }) => void;
}

const PostQuickViewContext = createContext<PostQuickViewContextValue | null>(null);

/**
 * Always provided by the (main) layout. Falls back to a no-op when a feed
 * surface somehow renders outside the provider so a stray render can never
 * throw.
 */
export function usePostQuickView(): PostQuickViewContextValue {
  return useContext(PostQuickViewContext) ?? { open: () => {} };
}

interface HistoryMarker {
  __postQuickView?: boolean;
}

export function PostQuickViewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuickViewState | null>(null);
  const pathname = usePathname();

  const open = useCallback((item: FeedItem, opts?: { focusComposer?: boolean }) => {
    setState({ item, focusComposer: opts?.focusComposer ?? false });
    // Throwaway entry so Back closes the quick view, not the feed.
    window.history.pushState({ __postQuickView: true } satisfies HistoryMarker, "");
  }, []);

  // Back button / gesture pops our entry → close.
  useEffect(() => {
    const onPop = () => setState(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navigating via any link inside the quick view changes the route — drop
  // the overlay so it never strands over the destination page.
  useEffect(() => {
    setState(null);
  }, [pathname]);

  // ESC / backdrop / corner button: consume the pushed entry (→ popstate →
  // close) so URL + history stay clean; fall back to a plain close if our
  // marker isn't on top.
  const requestClose = useCallback(() => {
    const marker = window.history.state as HistoryMarker | null;
    if (marker?.__postQuickView === true) {
      window.history.back();
    } else {
      setState(null);
    }
  }, []);

  return (
    <PostQuickViewContext.Provider value={{ open }}>
      {children}
      {state !== null && (
        <Dialog
          title="Post"
          bare
          mobileSheet
          onClose={requestClose}
          panelClassName="max-w-2xl max-h-[92vh] overflow-y-auto"
        >
          <button
            type="button"
            onClick={requestClose}
            className="bcc-mono mb-2 inline-flex items-center gap-1 text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
          >
            ← Back
          </button>
          <PostDetail
            item={state.item}
            focusComposer={state.focusComposer}
            className="bcc-panel relative flex flex-col gap-3 rounded-b-none rounded-t-2xl p-4 sm:p-5 md:rounded-2xl"
          />
        </Dialog>
      )}
    </PostQuickViewContext.Provider>
  );
}
