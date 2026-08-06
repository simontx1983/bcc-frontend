"use client";

/**
 * WatchersPanel — the "Watchers" tab of /watching.
 *
 * Members who watch the signed-in operator, rendered as the same
 * CardFactory trading card the sibling tab uses. Reads the §3.1 follow
 * graph via `useUserFollowers` (offset paged, 24 per page).
 *
 * Why not RosterList (profile/panels/WatchingPanel.tsx): that component
 * accumulates pages into local state and skips any offset it has
 * already seen, so a refetch triggered by a watch/unwatch invalidation
 * never reaches the rendered list. This surface is the viewer's own
 * watch-state cockpit — it has to show live pages. PREV/NEXT over a
 * live query is also the directory idiom (/members, /mentors), which is
 * what a full-page card grid should read as.
 *
 * Self-view only, so there's no `bcc_permission_denied` branch — the
 * privacy gate can't fire against your own graph.
 *
 * Two structural notes, both mirrored from <WatchingCardsPanel>:
 *
 *   - `pagination.total` is a RAW follow-edge count. §4.4 skips rows
 *     whose user no longer exists, so `items.length` can be short — and
 *     a trailing page can come back with nothing renderable at all. The
 *     page-overflow guard below is what keeps that from stranding the
 *     viewer on an empty page with no pager to escape from.
 *   - the pager is rendered from the last successful pagination, so a
 *     PREV/NEXT doesn't unmount it while the next page loads.
 */

import { useEffect, useState } from "react";

import { CardGrid } from "@/components/cards/CardGrid";
import { CardGridSkeleton } from "@/components/cards/CardGridSkeleton";
import { PagerNav } from "@/components/ui/PagerNav";
import { FOLLOWS_DEFAULT_LIMIT, useUserFollowers } from "@/hooks/useUserActivity";
import { humanizeCode } from "@/lib/api/errors";
import type { UserFollowsResponse } from "@/lib/api/types";

type FollowsPagination = UserFollowsResponse["pagination"];

export interface WatchersPanelProps {
  handle: string;
  /** 1-based page, owned by the shell's `?page=` param. */
  page: number;
  onPageChange: (next: number) => void;
}

export function WatchersPanel({
  handle,
  page,
  onPageChange,
}: WatchersPanelProps) {
  const query = useUserFollowers(handle, (page - 1) * FOLLOWS_DEFAULT_LIMIT);

  const items = query.data?.items ?? [];

  // Pagination is stable across page changes — hold the most recent
  // successful response so the pager doesn't flash empty while the next
  // page loads. Held locally rather than by giving `useUserFollowers`
  // placeholderData: that hook is shared with the profile WatchingPanel
  // accumulator, and changing its caching semantics reaches a surface
  // outside this one.
  const [lastPagination, setLastPagination] = useState<
    FollowsPagination | undefined
  >(undefined);
  useEffect(() => {
    if (query.data !== undefined) {
      setLastPagination(query.data.pagination);
    }
  }, [query.data]);

  // Page-overflow guard, same contract as <WatchingCardsPanel>: a
  // successful but empty page above page 1 is indistinguishable from
  // "nobody watches you", and the pager below never mounts, so the only
  // exit would be hand-editing the URL. Two ways to land here — a
  // watcher unwatching the last row of a trailing page, or §4.4 dropping
  // every row on that page as a deleted user.
  //
  // Clamp rather than step: a stale bookmark at ?page=200 would
  // otherwise cost 199 sequential replaces + refetches to walk home.
  // Loop-safe — it only runs on a *successful* empty page above page 1,
  // and the result is always < `page` (min caps at `page - 1`, max
  // floors at 1 which is below any page that passes the guard), so it
  // strictly decreases and terminates at 1.
  const total = query.data?.pagination.total;
  useEffect(() => {
    if (query.isSuccess && items.length === 0 && page > 1) {
      const lastPage = Math.max(
        1,
        Math.ceil((total ?? 0) / FOLLOWS_DEFAULT_LIMIT),
      );
      onPageChange(Math.max(1, Math.min(page - 1, lastPage)));
    }
  }, [query.isSuccess, total, items.length, page, onPageChange]);

  if (query.isError) {
    return (
      <section className="mt-12">
        <p role="alert" className="bcc-mono text-safety">
          {/* §γ — copy is keyed on err.code; never render err.message. */}
          {humanizeCode(
            query.error,
            {
              bcc_unauthorized: "Sign in to see your watchers.",
              bcc_rate_limited: "Loading too fast — give it a moment and try again.",
              bcc_unavailable: "Your watchers are temporarily unavailable. Try again shortly.",
            },
            "Couldn't load your watchers. Try again in a moment.",
          )}
        </p>
      </section>
    );
  }

  const pagination = query.data?.pagination ?? lastPagination;

  // First load — nothing successful to frame the skeleton with yet, so
  // no pager. (On a *page change* `lastPagination` is populated and we
  // fall through to the pager-bearing branch below instead.)
  if (pagination === undefined) {
    return <CardGridSkeleton ariaLabel="Loading your watchers" />;
  }

  // Terminal empty state only once the query has settled — during a page
  // transition `items` is empty simply because the next page is in
  // flight.
  if (!query.isPending && items.length === 0) {
    return (
      <section className="mt-12">
        <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
          <p className="bcc-mono text-safety">NO WATCHERS</p>
          <h2 className="bcc-stencil mt-2 text-3xl text-bcc-text">
            Nobody&rsquo;s watching you yet.
          </h2>
          <p className="mt-3 font-serif leading-relaxed text-bcc-text-secondary">
            Watchers show up when other members start keeping tabs on you.
            Post on the floor, review what you know, make solid calls —
            that&rsquo;s what earns them.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-10">
      {query.isPending ? (
        <CardGridSkeleton ariaLabel="Loading your watchers" />
      ) : (
        <CardGrid cards={items} />
      )}

      <PagerNav
        page={page}
        // Display count only — derived from the raw edge total, so it can
        // read one page long when the tail is all deleted users.
        totalPages={Math.ceil(pagination.total / FOLLOWS_DEFAULT_LIMIT)}
        // …which is exactly why NEXT is gated on the server's own
        // `has_more` instead of `page < totalPages`.
        hasNext={pagination.has_more}
        onPageChange={onPageChange}
        isBusy={query.isFetching}
      />
    </div>
  );
}
