"use client";

/**
 * WatchingGrid — paginated /me/watching view.
 *
 * Composes:
 *   - <WatchingHeader>   identity-snapshot summary metrics
 *   - tile grid          one <WatchingTile> per item, 12 per page
 *   - pagination footer  prev/next + page indicator from WatchingResponse.pagination
 *
 * State: `page` lives locally (not URL-synced for V1 — keeps the
 * watchlist feeling like a single surface rather than a deep-linkable
 * list). When the watchlist graduates to a public profile sub-tab,
 * lift `page` to the URL via `useSearchParams`.
 *
 * Empty + loading + error states per §N10.
 *
 * Renamed from `BinderGrid` 2026-05-13 per the §1.1.1 additive-
 * deprecation runway (`docs/api-contract-v1.md §4.5.1`).
 */

import Link from "next/link";
import { useState } from "react";

import { WatchingHeader } from "@/components/watching/WatchingHeader";
import { WatchingTile } from "@/components/watching/WatchingTile";
import { useWatching, useWatchingSummary } from "@/hooks/useWatching";

export interface WatchingGridProps {
  handle: string;
}

const PAGE_SIZE = 12;

export function WatchingGrid({ handle }: WatchingGridProps) {
  const [page, setPage] = useState(1);
  const watching = useWatching({ page, page_size: PAGE_SIZE });
  const summary = useWatchingSummary();

  // Pagination is stable across page changes — read from the most
  // recent successful response so the footer doesn't flash empty
  // while the next page is loading.
  const pagination = watching.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <main className="min-h-screen pb-24">
      <header className="bcc-rail">
        <span>
          <span className="bcc-rail-dot" />
          BCC // Watching
        </span>
        <span className="bcc-mono text-cardstock-deep">@{handle}</span>
      </header>

      <WatchingHeader handle={handle} total={total} summary={summary.data} />

      <WatchingGridBody result={watching} />

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          isFetching={watching.isFetching}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body — handles loading / error / empty / data states.
// ─────────────────────────────────────────────────────────────────────

function WatchingGridBody({ result }: { result: ReturnType<typeof useWatching> }) {
  if (result.isLoading) {
    return (
      <section className="mx-auto mt-12 flex max-w-6xl justify-center px-6 sm:px-8">
        <p className="bcc-mono text-cardstock-deep">Loading your watchlist…</p>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-6 sm:px-8">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load watchlist: {result.error.message}
        </p>
        <button
          type="button"
          onClick={() => {
            void result.refetch();
          }}
          className="bcc-mono mt-3 text-cardstock-deep underline"
        >
          Try again
        </button>
      </section>
    );
  }

  const items = result.data?.items ?? [];

  if (items.length === 0) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-6 sm:px-8">
        <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
          <p className="bcc-mono text-safety">WATCHING NOTHING</p>
          <h2 className="bcc-stencil mt-2 text-3xl text-ink">
            Nothing on your watchlist yet.
          </h2>
          <p className="mt-3 font-serif leading-relaxed text-ink-soft">
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

  return (
    <section className="mx-auto mt-12 max-w-6xl px-8">
      <div className="flex flex-wrap justify-center gap-6">
        {items.map((item) => (
          <WatchingTile key={item.follow_id} item={item} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pagination footer — simple prev/next with a numeric indicator.
// Stays disabled while a page transition is in flight to prevent
// clicking ahead of the data.
// ─────────────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
  isFetching: boolean;
}

function Pagination({ page, totalPages, onChange, isFetching }: PaginationProps) {
  const canPrev = page > 1 && !isFetching;
  const canNext = page < totalPages && !isFetching;

  return (
    <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={!canPrev}
        className="bcc-stencil border border-cardstock-edge/40 px-4 py-2 text-cardstock disabled:opacity-40"
      >
        ← Prev
      </button>

      <span className="bcc-mono text-cardstock-deep">
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={!canNext}
        className="bcc-stencil border border-cardstock-edge/40 px-4 py-2 text-cardstock disabled:opacity-40"
      >
        Next →
      </button>
    </footer>
  );
}
