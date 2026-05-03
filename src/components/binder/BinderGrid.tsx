"use client";

/**
 * BinderGrid — paginated /me/binder view.
 *
 * Composes:
 *   - <BinderHeader>     identity-snapshot summary metrics
 *   - tile grid          one <BinderTile> per item, 12 per page
 *   - pagination footer  prev/next + page indicator from BinderResponse.pagination
 *
 * State: `page` lives locally (not URL-synced for V1 — keeps the
 * binder feeling like a single surface rather than a deep-linkable
 * list). When the binder graduates to a public profile sub-tab,
 * lift `page` to the URL via `useSearchParams`.
 *
 * Empty + loading + error states per §N10.
 */

import Link from "next/link";
import { useState } from "react";

import { BinderHeader } from "@/components/binder/BinderHeader";
import { BinderTile } from "@/components/binder/BinderTile";
import { useBinder, useBinderSummary } from "@/hooks/useBinder";

export interface BinderGridProps {
  handle: string;
}

const PAGE_SIZE = 12;

export function BinderGrid({ handle }: BinderGridProps) {
  const [page, setPage] = useState(1);
  const binder = useBinder({ page, page_size: PAGE_SIZE });
  const summary = useBinderSummary();

  // Pagination is stable across page changes — read from the most
  // recent successful response so the footer doesn't flash empty
  // while the next page is loading.
  const pagination = binder.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <main className="min-h-screen pb-24">
      <header className="bcc-rail">
        <span>
          <span className="bcc-rail-dot" />
          BCC // Binder
        </span>
        <span className="bcc-mono text-cardstock-deep">@{handle}</span>
      </header>

      <BinderHeader handle={handle} total={total} summary={summary.data} />

      <BinderGridBody result={binder} />

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          isFetching={binder.isFetching}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Body — handles loading / error / empty / data states.
// ─────────────────────────────────────────────────────────────────────

function BinderGridBody({ result }: { result: ReturnType<typeof useBinder> }) {
  if (result.isLoading) {
    return (
      <section className="mx-auto mt-12 flex max-w-6xl justify-center px-8">
        <p className="bcc-mono text-cardstock-deep">Loading your binder…</p>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-8">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load binder: {result.error.message}
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
      <section className="mx-auto mt-12 max-w-6xl px-8">
        <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
          <p className="bcc-mono text-safety">EMPTY BINDER</p>
          <h2 className="bcc-stencil mt-2 text-3xl text-ink">
            Nothing pulled yet.
          </h2>
          <p className="mt-3 font-serif leading-relaxed text-ink-soft">
            Pull a validator, creator, or project you&rsquo;d actually trust.
            The card lands here. The floor remembers.
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
          <BinderTile key={item.follow_id} item={item} />
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
    <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between gap-4 px-8">
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
