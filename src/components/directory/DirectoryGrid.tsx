"use client";

/**
 * DirectoryGrid — paginated card grid for the §G1/§G2 directory.
 *
 * Renders the flat list of Cards from `useDirectory` as a responsive
 * grid of <CardFactory> instances and exposes a "Load more" button
 * that hits `fetchNextPage()`. Pagination is page-based (1..20 hard
 * cap server-side); when `hasNextPage` flips to false the button
 * disappears.
 *
 * States:
 *   - loading-initial → skeleton row of placeholder tiles
 *   - error           → inline message with no retry button (the
 *                       parent's filter changes refresh the query
 *                       naturally; spurious retries bury real fixes)
 *   - empty           → §N10 empty-state copy with a hint to widen
 *                       the filter set
 *   - has-data        → grid + load-more
 *   - loading-more    → grid + spinner-state on button
 */

import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";

import { CardFactory } from "@/components/cards/CardFactory";
import type { BccApiError, Card, CardsListResponse } from "@/lib/api/types";

interface Props {
  query: UseInfiniteQueryResult<InfiniteData<CardsListResponse>, BccApiError>;
}

export function DirectoryGrid({ query }: Props) {
  if (query.isError) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-6 text-center">
        <p className="font-serif text-sm text-ink-soft">
          The directory hit a snag. Try a different filter or refresh in a moment.
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <ul
        aria-label="Loading directory results"
        className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]"
      >
        {Array.from({ length: 8 }).map((_, idx) => (
          <li
            key={idx}
            aria-hidden
            className="bcc-panel h-[460px] animate-pulse opacity-40"
          />
        ))}
      </ul>
    );
  }

  // Flatten pages into a single Card[]. Each page is an independent
  // CardsListResponse — concat in order.
  const items: Card[] = (query.data?.pages ?? []).flatMap((p) => p.items);

  if (items.length === 0) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-8 text-center">
        <p className="bcc-mono text-safety">NO MATCHES</p>
        <h2 className="bcc-stencil mt-2 text-3xl text-ink">
          Filter&rsquo;s too tight.
        </h2>
        <p className="mt-3 font-serif leading-relaxed text-ink-soft">
          Drop a tier, switch the kind, or clear the search. Plenty more
          on the floor.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* `bcc-card` is a fixed 316px wide (perspective + 3D flip rely on
          a stable card width). An `auto-fit` track packs only as many
          316px columns as the available width admits, so cards never
          overlap regardless of sidebar / breakpoint. `justify-center`
          centers any leftover space when the row isn't full. */}
      <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]">
        {items.map((card) => (
          <li key={`${card.card_kind}-${card.id}`}>
            <CardFactory card={card} />
          </li>
        ))}
      </ul>

      {query.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className={
              "bcc-stencil rounded-sm px-6 py-3 text-[12px] tracking-[0.2em] transition " +
              (query.isFetchingNextPage
                ? "cursor-wait bg-cardstock-deep/40 text-ink-soft/60"
                : "bg-ink text-cardstock hover:bg-ink-soft")
            }
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        </div>
      )}
    </>
  );
}
