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
 * recent-activity fallback bucket, which the server already merges
 * into the response when the viewer has zero follows; the frontend
 * doesn't branch on follow count. (Sprint 4: the in-code label
 * previously said "Hot on the Floor" — renamed here so the engagement-
 * metric metaphor doesn't pave a road to future user-facing copy.)
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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DiscoverPanel } from "@/components/feed/DiscoverPanel";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { HighlightStrip } from "@/components/feed/HighlightStrip";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import {
  FEED_QUERY_KEY_ROOT,
  HOT_FEED_QUERY_KEY,
  useFeed,
  useHotFeed,
} from "@/hooks/useFeed";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import {
  shouldWithdrawOnDenial,
  useDenialGate,
  useReportDenial,
} from "@/lib/api/resource-denial";
import type { FeedItem, FeedScope } from "@/lib/api/types";

export interface FeedViewProps {
  isAuthenticated: boolean;
}

export function FeedView({ isAuthenticated }: FeedViewProps) {
  const [scope, setScope] = useState<FeedScope>("for_you");

  return (
    <section className="mx-auto w-full max-w-3xl px-2 sm:px-3">
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

/** Shown once the server has withdrawn permission to read a feed. */
const FEED_WITHDRAWN_COPY = "You can’t read this feed.";

/**
 * The denial gates for the three feed owners.
 *
 * <FeedBody> receives the query as PROPS, so it has no query key and cannot
 * host the gate itself. That is a placement constraint, not an exemption:
 * the key exists one level up, in whichever component calls the hook. So
 * the gate goes there, and the hook call stays inside the gated child —
 * which is what makes unmount-then-remove safe.
 */
function AuthedFeed({ scope }: { scope: FeedScope }) {
  const gate = useDenialGate([...FEED_QUERY_KEY_ROOT, scope]);
  if (gate.withdrawn) {
    return <LoadFailure message={FEED_WITHDRAWN_COPY} />;
  }
  return <AuthedFeedData scope={scope} onDenied={gate.withdraw} />;
}

function AuthedFeedData({
  scope,
  onDenied,
}: {
  scope: FeedScope;
  onDenied: () => void;
}) {
  const query = useFeed(scope);
  useReportDenial(
    shouldWithdrawOnDenial(query.error, query.isRefetchError, query.data !== undefined),
    onDenied,
  );
  return (
    <>
      {/* §O2 highlights — a curated top-3 digest of the signal stream
          (WATCH / WORTH KNOWING / ON THE FLOOR). Lives at the head of the
          Signals scope specifically: it's the personalized "what matters"
          summary of the same events the Signals feed lists in full below.
          Part of the scroll (not sticky) and self-collapsing (renders
          nothing when empty), so it never reserves space without content.
          Auth is satisfied by this being the authed branch. */}
      {scope === "signals" && <HighlightStrip />}
      <FeedBody {...query} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Anon branch — useHotFeed. No tabs; the §F2 recent-activity bucket.
// ─────────────────────────────────────────────────────────────────────

function AnonFeed() {
  const gate = useDenialGate(HOT_FEED_QUERY_KEY);
  if (gate.withdrawn) {
    return <LoadFailure message={FEED_WITHDRAWN_COPY} />;
  }
  return <AnonFeedData onDenied={gate.withdraw} />;
}

function AnonFeedData({ onDenied }: { onDenied: () => void }) {
  const query = useHotFeed();
  useReportDenial(
    shouldWithdrawOnDenial(query.error, query.isRefetchError, query.data !== undefined),
    onDenied,
  );
  return (
    <div className="pt-2">
      <div className="bcc-mono mb-3 flex items-center gap-3 text-bcc-text-secondary">
        <span className="inline-block h-px w-8 bg-bcc-border" />
        <span>On the floor right now</span>
        <span className="inline-block h-px flex-1 bg-bcc-border" />
      </div>
      <FeedBody {...query} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FeedBody — shared loading/error/empty/data layout for both branches.
// Accepts the InfiniteQuery result directly so both useFeed and
// useHotFeed feed it without a wrapper.
// ─────────────────────────────────────────────────────────────────────

export interface FeedBodyProps {
  data: { pages: { items: FeedItem[] }[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * The three-way split. Optional because this interface is also the
   * contract for hand-built props in tests; every production caller
   * spreads the whole query (`<FeedBody {...query} />`), so they arrive
   * for free. Absent means "treat it as a first load", which is the old
   * behaviour and the safe default.
   */
  isLoadingError?: boolean;
  isRefetchError?: boolean;
  isFetchNextPageError?: boolean;
  error: Error | null;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
  /**
   * Override the empty-result surface. Defaults to <DiscoverPanel /> —
   * the §F5 cold-start bridge for the main Floor feed. Tag/scoped feeds
   * pass their own quiet empty tile instead.
   */
  emptyState?: React.ReactNode;
}

export function FeedBody(props: FeedBodyProps) {
  const {
    data, isLoading, isError, error, isFetchingNextPage, hasNextPage,
    fetchNextPage, refetch, emptyState,
  } = props;

  // Absent flags fall back to the old all-or-nothing behaviour rather than
  // silently retaining content a caller never told us about.
  const isLoadingError = props.isLoadingError ?? isError;
  const isRefetchError = props.isRefetchError ?? false;
  const isFetchNextPageError = props.isFetchNextPageError ?? false;

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

  // Flatten paginated pages into one list — memoized so it isn't rebuilt into a
  // new array (and new downstream identities) on every render (perf-audit F5).
  // Placed above the early returns to satisfy the rules of hooks.
  const items = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.items),
    [data?.pages]
  );

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
            className={SKELETON_CLASS + " h-40"}
          >
            <div className="flex h-full flex-col justify-between p-4">
              <span className="block h-3 w-1/3 rounded-sm bg-bcc-surface-hover" />
              <span className="block h-3 w-4/5 rounded-sm bg-bcc-surface-hover" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    error,
    {
      bcc_unauthorized: "Sign in to see your feed.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "The feed is temporarily unavailable. Try again shortly.",
      // All three denial codes, or the copy falls through to a default
      // ending in "Try again in a moment" — advice withheld with the
      // control.
      bcc_forbidden: "You can’t read this feed.",
      bcc_permission_denied: "You can’t read this feed.",
      bcc_blocked: "You can’t read this feed.",
    },
    "Couldn't load the feed. Try again in a moment.",
  );

  const denied = isPermissionDenial(error);
  const refetchProps = denied ? {} : { onRetry: refetch };
  const nextPageProps = denied ? {} : { onRetry: () => fetchNextPage() };

  // ONLY a first-load failure may replace the feed. A blanket `isError` was
  // true for all three failures and returned here BEFORE reading
  // `data.pages`, so one failed auto-load — which the IntersectionObserver
  // fires without any user action — replaced a scrolled feed with an error
  // panel. The other two are handled at the foot of the list.
  if (isLoadingError) {
    return <LoadFailure message={failureCopy} {...refetchProps} />;
  }

  // An empty feed is a claim about the SERVER having nothing. A failed read
  // does not support it, and DiscoverPanel's cold-start copy is actively
  // wrong there — it tells someone the room is quiet when the request failed.
  if (items.length === 0 && !isError) {
    // §F5 / Sprint 3 — cold-start bridge surface. DiscoverPanel mounts
    // ONLY here (parent gates on items.length === 0). It is NOT a
    // default feed for inactive users; it's a one-shot map showing the
    // room is still here and offering three paths forward. See
    // DiscoverPanel.tsx for the full constitutional comment + locked
    // phrases. On loading/error/all-empty it falls back to a quiet
    // Floor panel that preserves the prior empty-state voice.
    //
    // Callers (tag/scoped feeds) may override with their own quiet
    // empty tile; the main Floor feed keeps DiscoverPanel as default.
    return <>{emptyState ?? <DiscoverPanel enabled />}</>;
  }

  return (
    <div className="flex flex-col gap-4 pb-4 pt-1">
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
      ))}

      {/* A failed REFRESH keeps the feed and localises the recovery; the
          cursor is still coherent so paging stays open. */}
      {isRefetchError && (
        <div className="mt-4">
          <LoadFailure message={failureCopy} {...refetchProps} />
        </div>
      )}

      {/* Cursor safety: while the NEXT page is failed, both the sentinel
          and the button are withdrawn. The sentinel matters most — leaving
          it mounted would let the IntersectionObserver re-fire the same
          failing page on every scroll, with no user action at all. */}
      {isFetchNextPageError && (
        <div className="mt-4">
          <LoadFailure message={failureCopy} {...nextPageProps} />
        </div>
      )}

      {hasNextPage && !isFetchNextPageError && !denied && (
        <>
          {/* Sentinel for the IntersectionObserver. h-px keeps it
              effectively invisible but still observable. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {isFetchingNextPage ? (
            <div className="mt-4 flex justify-center py-2.5 text-[var(--bcc-accent)]">
              <Spinner size={22} />
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLoadMore}
              className="bcc-stencil mx-auto mt-4 rounded-lg border border-[var(--bcc-border)] px-6 py-2.5 text-[var(--bcc-text-secondary)] transition-colors hover:border-[var(--bcc-accent)] hover:text-[var(--bcc-accent)]"
            >
              Load more
            </button>
          )}
        </>
      )}

      {/* "End of the floor" is a claim about the SERVER having no more
          posts. A failed next page means we do not know that. */}
      {!hasNextPage && !isFetchNextPageError && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-bcc-text-secondary">
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
