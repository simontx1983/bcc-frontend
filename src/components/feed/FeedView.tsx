"use client";

/**
 * FeedView — composes the three pieces of the Floor feed:
 *   - <FeedTabs>      scope switcher (logged-in only)
 *   - <FeedItemCard>  per-row renderer
 *   - "Load more"     cursor-paginated trigger via useInfiniteQuery
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
 */

import { useState } from "react";

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

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="bcc-mono text-cardstock-deep">Loading the Floor…</p>
      </div>
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
    return (
      <div className="py-12">
        <div className="bcc-panel mx-auto max-w-md p-6 text-center">
          <h2 className="bcc-stencil text-2xl text-ink">Quiet on the Floor</h2>
          <p className="mt-2 font-serif text-ink-soft">
            Pull a card or two to start your feed, or check back in a bit —
            new activity rolls in throughout the day.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {items.map((item) => (
        <FeedItemCard key={item.id} item={item} />
      ))}

      {hasNextPage && (
        <button
          type="button"
          onClick={fetchNextPage}
          disabled={isFetchingNextPage}
          className="bcc-stencil mx-auto mt-4 border border-cardstock-edge/40 px-6 py-2.5 text-cardstock disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}

      {!hasNextPage && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-cardstock-deep/60">
          End of the floor.
        </p>
      )}
    </div>
  );
}
