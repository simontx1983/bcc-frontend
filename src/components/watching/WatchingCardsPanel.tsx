"use client";

/**
 * WatchingCardsPanel — the "Watching" tab of /watching.
 *
 * Renders the viewer's watchlist as the canonical CardFactory trading
 * card (via <CardGrid>), the same object the /members directory and the
 * profile roster render. Before v1.76 this surface drew its own slim
 * <WatchingTile> from the identifier-only §C2 row because a full card
 * would have cost N+1 lookups; `?include=cards` removes that constraint,
 * so the tile is gone and there is one card in the app again.
 *
 * Page state is the shell's (URL-backed) — this panel only asks for a
 * page and reports which page it wants next.
 *
 * States per §N10: loading / error / empty / data — with the loading
 * state split in two. A *first* load has nothing to draw and collapses
 * to a bare skeleton; a *page change* keeps the metric strip and the
 * pager mounted (rendered from the last successful pagination) and swaps
 * only the grid, so the surface doesn't rebuild itself under every
 * PREV/NEXT.
 */

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CardGrid } from "@/components/cards/CardGrid";
import { CardGridSkeleton } from "@/components/cards/CardGridSkeleton";
import { PagerNav } from "@/components/ui/PagerNav";
import { WatchingHeader } from "@/components/watching/WatchingHeader";
import { useUnwatchMutation } from "@/hooks/useWatch";
import { useWatching, useWatchingSummary } from "@/hooks/useWatching";
import { humanizeCode } from "@/lib/api/errors";
import type { Card, WatchingItem, WatchingPagination } from "@/lib/api/types";

/**
 * Hydrated reads cap at 24 server-side; 12 keeps the grid to four rows
 * at three columns. Exported so <WatchingTabs> can subscribe to the
 * byte-identical page-1 query key and have React Query dedupe it.
 */
export const WATCHING_PAGE_SIZE = 12;

export interface WatchingCardsPanelProps {
  /** 1-based page, owned by the shell's `?page=` param. */
  page: number;
  onPageChange: (next: number) => void;
}

export function WatchingCardsPanel({
  page,
  onPageChange,
}: WatchingCardsPanelProps) {
  const watching = useWatching({
    page,
    page_size: WATCHING_PAGE_SIZE,
    include: "cards",
  });
  const summary = useWatchingSummary();

  const items = watching.data?.items ?? [];

  // Pagination is stable across page changes — hold the most recent
  // successful response so the metric strip and the pager don't collapse
  // into the skeleton on every PREV/NEXT (the behavior the WatchingGrid
  // this panel replaced was careful to have). Held locally rather than by
  // giving `useWatching` placeholderData: that hook also backs CardGrid's
  // follow-map, MemberFollowButton, RightSidebar and the onboarding
  // wizard, and changing its caching semantics reaches all of them.
  //
  // Only the pagination needs holding. `useWatchingSummary`'s key is
  // page-independent (`["watching", "summary"]`) and React Query keeps
  // its data through a refetch, so `summary.data` is already stable
  // across page changes — mirroring it here would be dead state.
  const [lastPagination, setLastPagination] = useState<
    WatchingPagination | undefined
  >(undefined);
  useEffect(() => {
    if (watching.data !== undefined) {
      setLastPagination(watching.data.pagination);
    }
  }, [watching.data]);

  // Page-overflow guard: unwatching the last row of a trailing page
  // strands the viewer on an empty page they can't tell from "you watch
  // nothing". Clamp to the last real page rather than stepping — a stale
  // bookmark at ?page=200 would otherwise cost 199 sequential replaces +
  // refetches to walk home. Loop-safe — it only runs on a *successful*
  // empty page above page 1, and the result is always < `page` (min caps
  // at `page - 1`, max floors at 1 which is below any page that passes
  // the guard), so it strictly decreases and terminates at 1.
  const serverTotalPages = watching.data?.pagination.total_pages;
  useEffect(() => {
    if (watching.isSuccess && items.length === 0 && page > 1) {
      onPageChange(Math.max(1, Math.min(page - 1, serverTotalPages ?? 1)));
    }
  }, [watching.isSuccess, serverTotalPages, items.length, page, onPageChange]);

  if (watching.isError) {
    return (
      <section className="mt-12">
        <p role="alert" className="bcc-mono text-safety">
          {/* §γ — copy is keyed on err.code; never render err.message. */}
          {humanizeCode(
            watching.error,
            {
              bcc_unauthorized: "Sign in to see your watchlist.",
              bcc_rate_limited: "Loading too fast — give it a moment and try again.",
              bcc_unavailable: "Your watchlist is temporarily unavailable. Try again shortly.",
            },
            "Couldn't load your watchlist. Try again in a moment.",
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            void watching.refetch();
          }}
          className="bcc-mono mt-3 text-bcc-text-secondary underline"
        >
          Try again
        </button>
      </section>
    );
  }

  const pagination = watching.data?.pagination ?? lastPagination;

  // First load — nothing successful to frame the skeleton with yet, so
  // no header and no pager. (On a *page change* `lastPagination` is
  // populated and we fall through to the framed branch below instead.)
  //
  // isPending, not isLoading, drives that fall-through: useWatching is
  // auth-gated, and a disabled query (session still resolving) is pending
  // but NOT loading — using isLoading would flash the terminal empty
  // state at users who have a watchlist, on every hard load, before the
  // session settles.
  if (pagination === undefined) {
    return <CardGridSkeleton ariaLabel="Loading your watchlist" />;
  }

  // Terminal empty state only once the query has settled — during a page
  // transition `items` is empty simply because the next page is in
  // flight.
  if (!watching.isPending && items.length === 0) {
    return (
      <section className="mt-12">
        <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
          <p className="bcc-mono text-safety">WATCHING NOTHING</p>
          <h2 className="bcc-stencil mt-2 text-3xl text-bcc-text">
            Nothing on your watchlist yet.
          </h2>
          <p className="mt-3 font-serif leading-relaxed text-bcc-text-secondary">
            Start watching a validator, creator, or project you&rsquo;d actually
            trust. The card lands here. The floor remembers.
          </p>
          <Link
            href="/directory"
            className="bcc-btn bcc-btn-primary mt-6 inline-flex"
          >
            Browse the Directory
          </Link>
        </div>
      </section>
    );
  }

  // IMPORTANT: `item.card` is the ONLY availability discriminator. Do
  // not branch on `is_resolved` — that flag means "page-backed"
  // (validator/project/creator), which says nothing about whether a
  // renderable view-model exists. Member watches are unresolved and
  // hydrate perfectly fine.
  const cards: Card[] = items
    .map((item) => item.card)
    .filter((card): card is Card => card !== null && card !== undefined);

  const unhydrated = items.filter(
    (item) => item.card === null || item.card === undefined,
  );

  return (
    <>
      {/* Header and pager render from `pagination`, which survives a page
          change — only the grid area swaps to the skeleton, and PagerNav's
          `isBusy` lock finally has chips to lock. */}
      <WatchingHeader total={pagination.total} summary={summary.data} />

      <div className="mt-10">
        {/* Inherited CardGrid limitation: its own follow-map read is
            capped at the first 50 watches, so past that the "Keep Tabs"
            CTA on a card can render idle even though this very list is
            the proof it's watched. Cosmetic only — the toggle still
            writes correctly, and a refetch restores the label. */}
        {watching.isPending ? (
          <CardGridSkeleton ariaLabel="Loading your watchlist" />
        ) : (
          <CardGrid cards={cards} />
        )}
      </div>

      <UnresolvedStrip items={unhydrated} />

      <PagerNav
        page={page}
        totalPages={pagination.total_pages}
        onPageChange={onPageChange}
        isBusy={watching.isFetching}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// UnresolvedStrip — rows the server couldn't hydrate into a card
// (deleted page, kind/id mismatch). They'd otherwise vanish silently
// and the viewer would have no way to clear them off the watchlist.
// ─────────────────────────────────────────────────────────────────────

function UnresolvedStrip({ items }: { items: WatchingItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
        Not available as cards
      </h2>
      <ul className="mt-3 divide-y divide-bcc-border-light border-y border-bcc-border-light">
        {items.map((item) => (
          // follow_id auto-increment ranges overlap across the two watch
          // sources (peepso follows vs bcc_page_follows), so the key must
          // include follow_source to stay unique on a mixed page.
          <UnresolvedRow
            key={`${item.follow_source ?? "peepso"}-${item.follow_id}`}
            item={item}
          />
        ))}
      </ul>
    </section>
  );
}

function UnresolvedRow({ item }: { item: WatchingItem }) {
  const unwatch = useUnwatchMutation();

  return (
    <li className="flex items-center gap-3 py-2">
      <Link
        href={item.links.card as Route}
        className="bcc-mono min-w-0 flex-1 truncate text-bcc-text-secondary hover:text-bcc-text"
      >
        @{item.card_handle}
      </Link>

      <span className="bcc-mono shrink-0 truncate text-[10px] tracking-[0.18em] text-bcc-text-secondary">
        {item.card_kind.toUpperCase()}
      </span>

      <button
        type="button"
        onClick={() => {
          unwatch.mutate({
            follow_id: item.follow_id,
            source: item.follow_source ?? "peepso",
          });
        }}
        disabled={unwatch.isPending}
        className="bcc-mono shrink-0 text-[10px] tracking-[0.18em] text-bcc-text-secondary underline disabled:opacity-50"
      >
        {unwatch.isPending ? "…" : "UNWATCH"}
      </button>
    </li>
  );
}
