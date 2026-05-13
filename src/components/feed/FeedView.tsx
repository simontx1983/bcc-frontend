"use client";

/**
 * FeedView — composes the three pieces of the Floor feed:
 *   - <FeedTabs>      scope switcher (logged-in only)
 *   - <FeedItemCard>  per-row renderer
 *   - "Load more"     cursor-paginated trigger via useInfiniteQuery
 *                     + IntersectionObserver auto-load
 *
 * Two paths driven by `isAuthenticated`:
 *
 *   isAuthenticated = false → useHotFeed (anon /feed/hot, no tabs)
 *   isAuthenticated = true  → useFeed(scope), tabs visible
 *
 * The split keeps both paths simple; no conditional hook calls.
 *
 * Empty / loading / error states per §N10 — every surface explicitly
 * handles all three. The empty state for the For You tab is the §F2
 * "Hot on the Floor" fallback, which the server already merges into
 * the response when the viewer has zero follows; the frontend doesn't
 * branch on follow count.
 *
 * Loading state renders skeleton rows (matches DirectoryGrid's idiom)
 * so there's no layout shift when data arrives.
 *
 * Each row is wrapped in a memoized `FeedRow` so a single reaction's
 * surgical cache patch (see useReactions.patchFeedItem) re-renders
 * only the affected row, not the whole visible feed. Pattern matches
 * GroupFeedSection's `GroupFeedItem` wrapper.
 *
 * Pagination: a sentinel <div> just above the "Load more" button is
 * observed with rootMargin 400px so the next page begins fetching
 * before the user reaches the bottom. The button stays as a
 * keyboard-accessible fallback (observers don't fire from tab+Enter
 * navigation alone).
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";

import { DiscoverPanel } from "@/components/feed/DiscoverPanel";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { useFeed, useHotFeed } from "@/hooks/useFeed";
import type { FeedItem, FeedScope } from "@/lib/api/types";

export interface FeedViewProps {
  isAuthenticated: boolean;
}

export function FeedView({ isAuthenticated }: FeedViewProps) {
  const [scope, setScope] = useState<FeedScope>("for_you");

  return (
    <section className="mx-auto w-full max-w-3xl px-6">
      {isAuthenticated ? (
        <>
          <FeedTabs active={scope} onChange={setScope} />
          <AuthedFeed scope={scope} />
        </>
      ) : (
        <AnonFeed />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Authed branch — useFeed(scope). Re-mounts on scope change because
// each scope has its own queryKey, so React Query handles the cache.
// ─────────────────────────────────────────────────────────────────────

function AuthedFeed({ scope }: { scope: FeedScope }) {
  const query = useFeed(scope);
  return <FeedBody {...query} />;
}

// ─────────────────────────────────────────────────────────────────────
// Anon branch — useHotFeed. No tabs; the §F2 "Hot on the Floor" view.
// ─────────────────────────────────────────────────────────────────────

function AnonFeed() {
  const query = useHotFeed();
  return (
    <div className="pt-2">
      <FeedBody {...query} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FeedBody — shared loading/error/empty/data layout for both branches.
// Accepts the InfiniteQuery result directly so both useFeed and
// useHotFeed feed it without a wrapper.
// ─────────────────────────────────────────────────────────────────────

interface FeedBodyProps {
  data: { pages: { items: FeedItem[] }[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

function FeedBody(props: FeedBodyProps) {
  const { data, isLoading, isError, error, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = props;

  // Sentinel for IntersectionObserver auto-load. Sits just above the
  // "Load more" button so it scrolls into view (with the 400px root
  // margin) before the button visually crests the viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Stable load-more callback. Guard against duplicate dispatches when
  // the observer fires repeatedly while a fetch is already in flight.
  // Mirrors the GroupFeedSection pattern.
  const handleLoadMore = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Auto-load: when the sentinel intersects (rootMargin 400px), kick
  // the next page request. The internal !isFetchingNextPage guard
  // prevents duplicate fetches even if the sentinel stays in view
  // (e.g. very short feeds where the sentinel is permanently visible).
  // Defensive: skip the observer entirely on platforms without
  // IntersectionObserver — the "Load more" button below remains the
  // fallback path.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const node = sentinelRef.current;
    if (node === null) return undefined;
    if (!hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry !== undefined && entry.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [handleLoadMore, hasNextPage]);

  if (isLoading) {
    // Skeleton rows match DirectoryGrid's idiom: bcc-panel + animate-pulse +
    // opacity-40, sized to the average FeedItemCard height so there's no
    // layout shift when data arrives. Two stacked grey bars per row hint at
    // the header line + body line of a real card without inventing chrome.
    return (
      <ul
        aria-label="Loading the Floor"
        className="flex flex-col gap-4 py-4"
      >
        {Array.from({ length: 4 }).map((_, idx) => (
          <li
            key={idx}
            aria-hidden
            className="bcc-panel h-40 animate-pulse opacity-40"
          >
            <div className="flex h-full flex-col justify-between p-4">
              <span className="block h-3 w-1/3 rounded-sm bg-cardstock-deep/30" />
              <span className="block h-3 w-4/5 rounded-sm bg-cardstock-deep/20" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <div className="py-8">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load the feed{error?.message !== undefined ? `: ${error.message}` : "."}
        </p>
        <button
          type="button"
          onClick={refetch}
          className="bcc-mono mt-3 text-cardstock-deep underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Flatten paginated pages into one list.
  const items = (data?.pages ?? []).flatMap((page) => page.items);

  if (items.length === 0) {
    // §F5 / Sprint 3 — cold-start bridge surface. DiscoverPanel mounts
    // ONLY here (parent gates on items.length === 0). It is NOT a
    // default feed for inactive users; it's a one-shot map showing the
    // room is still here and offering three paths forward. See
    // DiscoverPanel.tsx for the full constitutional comment + locked
    // phrases. On loading/error/all-empty it falls back to a quiet
    // Floor panel that preserves the prior empty-state voice.
    return <DiscoverPanel enabled />;
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
      ))}

      {hasNextPage && (
        <>
          {/* Sentinel for the IntersectionObserver. h-px keeps it
              effectively invisible but still observable. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isFetchingNextPage}
            className="bcc-stencil mx-auto mt-4 border border-cardstock-edge/40 px-6 py-2.5 text-cardstock disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </>
      )}

      {!hasNextPage && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-cardstock-deep/60">
          End of the floor.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Memoized row wrapper. The reaction patches in useReactions clone
// only the affected item (siblings keep reference identity), so React
// will skip re-rendering siblings under shallow-equality memo. Mirror
// of GroupFeedSection's GroupFeedItem.
// ─────────────────────────────────────────────────────────────────────

const FeedRow = memo(function FeedRow({ item }: { item: FeedItem }) {
  return <FeedItemCard item={item} />;
});
