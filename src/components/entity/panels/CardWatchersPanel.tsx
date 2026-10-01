"use client";

/**
 * CardWatchersPanel — entity-profile Watchers tab content.
 *
 * Paginated list of users watching/pulling this entity. Mirrors
 * WatchingPanel's list+grid toggle (same localStorage key shared across
 * roster surfaces — picking GRID on /u sticks for /v too).
 *
 * Unclaimed cards return `pagination.total = 0` from the backend (no
 * graph anchor — see CardWatchersService). The panel renders a
 * tab-specific empty state in that case: "Claim this {kind} to anchor
 * watchers."
 *
 * Pagination is `useInfiniteQuery`. The previous version accumulated rows in
 * this component while `Body` decided during ITS render that a new page had
 * arrived — so the child set parent state mid-render and React warned
 * "Cannot update a component (`CardWatchersPanel`) while rendering a
 * different component (`Body`)". The page list lives in TanStack now, and
 * `Body` only reads it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { CardGrid } from "@/components/cards/CardGrid";
import { Avatar } from "@/components/identity/Avatar";
import { useCardWatchers } from "@/hooks/useCardTabs";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode } from "@/lib/api/errors";
import type { Card, EntityCardKind } from "@/lib/api/types";

interface CardWatchersPanelProps {
  kind: EntityCardKind;
  cardId: number;
  cardName: string;
  isClaimed: boolean;
}

type RosterView = "list" | "grid";

const VIEW_STORAGE_KEY = "bcc:roster-view";

function readStoredView(): RosterView {
  if (typeof window === "undefined") {
    return "list";
  }
  const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return raw === "grid" ? "grid" : "list";
}

export function CardWatchersPanel({
  kind,
  cardId,
  cardName,
  isClaimed,
}: CardWatchersPanelProps) {
  const [view, setView] = useState<RosterView>("list");
  useEffect(() => {
    setView(readStoredView());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const query = useCardWatchers(kind, cardId);

  // Pages in fetch order; TanStack appends only on success, so a failed LOAD
  // MORE leaves this exactly as it was.
  const watchers: Card[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const lastPage = query.data?.pages[query.data.pages.length - 1];

  /**
   * Retry the request that FAILED, not the ones that succeeded. `refetch()`
   * on an infinite query re-runs the pages already cached — after a failed
   * LOAD MORE that is every page except the one that failed. So a first-page
   * failure retries with `refetch`, and a failed next page with
   * `fetchNextPage`, which asks for the same offset again.
   */
  const retry = () => {
    if (watchers.length === 0) {
      void query.refetch();
    } else {
      void query.fetchNextPage();
    }
  };

  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Watchers
        </h3>
        <ViewToggle view={view} onChange={setView} />
      </header>

      <Body
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        watchers={watchers}
        total={lastPage?.pagination.total}
        hasMore={query.hasNextPage}
        isFetchingMore={query.isFetchingNextPage}
        view={view}
        cardName={cardName}
        isClaimed={isClaimed}
        onLoadMore={() => void query.fetchNextPage()}
        onRetry={retry}
      />
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Body — splits loading / error / empty / populated branches from the
// shell so the outer component reads as one shape regardless of state.
// ──────────────────────────────────────────────────────────────────────

interface BodyProps {
  isPending: boolean;
  isError: boolean;
  error: { message: string } | null;
  /** Already-flattened pages. Body READS this; it never produces it. */
  watchers: Card[];
  total: number | undefined;
  hasMore: boolean;
  isFetchingMore: boolean;
  view: RosterView;
  cardName: string;
  isClaimed: boolean;
  /** Narrow callbacks rather than the whole query result, so the child
   *  cannot reach any other query — and, now, cannot write any state. */
  onLoadMore: () => void;
  onRetry: () => void;
}

function Body(props: BodyProps) {
  const { watchers, view, cardName, isClaimed } = props;

  const failed = props.isError && props.error !== null;
  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    props.error,
    {
      bcc_unauthorized: "Sign in to see watchers.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "Watchers are temporarily unavailable. Try again shortly.",
    },
    "Couldn't load watchers. Try again in a moment.",
  );

  // Whole-body failure ONLY with nothing loaded. A failed LOAD MORE keeps
  // the watchers already read — that case is handled at the foot of the
  // list, below, so the roster and its view toggle survive.
  if (failed && watchers.length === 0) {
    return (
      <LoadFailure
        surface="paper"
        message={failureCopy}
        onRetry={props.onRetry}
      />
    );
  }

  if (props.isPending && watchers.length === 0) {
    return (
      <div className="px-8 py-12">
        <p className="bcc-mono text-ink-soft">Loading watchers…</p>
      </div>
    );
  }

  if (!failed && watchers.length === 0) {
    return (
      <EmptyState
        kicker="NO WATCHERS"
        heading={`No one is watching ${cardName} yet.`}
        hint={
          isClaimed
            ? `Watchers light up once members start watching this card.`
            : `${cardName} hasn't been claimed yet — claim anchors the page so members can pull it into their roster.`
        }
      />
    );
  }

  return (
    <div className="px-5 py-5">
      <p
        className="bcc-mono mb-3 text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {props.total ?? watchers.length} ON FILE
      </p>

      {view === "grid" ? (
        <CardGrid cards={watchers} />
      ) : (
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {watchers.map((card) => (
            <MemberRow key={card.id} card={card} />
          ))}
        </ul>
      )}

      {/* Cursor safety: LOAD MORE is withdrawn while this offset is
          failing — advancing would skip the offset that failed. Retry
          refetches that same offset; paging resumes once it succeeds. */}
      {failed ? (
        <LoadFailure
          surface="paper"
          message={failureCopy}
          onRetry={props.onRetry}
        />
      ) : (
        props.hasMore && (
          <div className="mt-6 flex justify-center">
            {/* 44px minimum — px-4 py-2 at 10px left this ~30px tall. */}
            <button
              type="button"
              onClick={props.onLoadMore}
              disabled={props.isFetchingMore}
              className="bcc-mono inline-flex min-h-[44px] items-center justify-center border border-ink/30 bg-cardstock px-4 text-ink disabled:opacity-50"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              LOAD MORE
            </button>
          </div>
        )
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: RosterView;
  onChange: (next: RosterView) => void;
}) {
  const options: ReadonlyArray<{ key: RosterView; label: string }> = [
    { key: "list", label: "List" },
    { key: "grid", label: "Grid" },
  ];

  return (
    <div
      role="group"
      aria-label="Watcher view"
      // `-my-3` cancels the 12px vertical padding `.bcc-paper-head` applies,
      // so two 44x44 controls fit the strip at its existing height instead of
      // growing it from ~43px to ~68px. The buttons stay inside the header's
      // border box — they fill it exactly.
      className="bcc-mono -my-3 flex items-center gap-1"
      style={{ fontSize: "10px", letterSpacing: "0.18em" }}
    >
      {options.map((opt, i) => {
        const active = view === opt.key;
        return (
          <span key={opt.key} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-cardstock-deep/60">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(opt.key)}
              aria-pressed={active}
              className={
                "inline-flex min-h-[44px] min-w-[44px] items-center justify-center transition-colors " +
                (active ? "text-safety" : "text-cardstock-deep hover:text-cardstock")
              }
            >
              {opt.label.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function MemberRow({ card }: { card: Card }) {
  const href = `/u/${card.handle}` as Route;
  // rank_label is `string | null` at the Card level (`""` on a member
  // with no awarded rank, `null` on page kinds). Guard both so the chip
  // only renders when there's a real rank to show.
  const rankLabel = card.rank_label;
  const hasRank = rankLabel !== null && rankLabel !== "";

  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 py-3 transition-colors hover:bg-ink/[0.03]"
        aria-label={`Open ${card.name}'s profile`}
      >
        <Avatar
          avatarUrl={card.crest.image_url}
          handle={card.handle}
          displayName={card.name}
          size="md"
          variant="rounded"
          tier={card.reputation_tier}
        />

        <span className="min-w-0 flex-1">
          <span className="bcc-stencil block truncate text-ink" style={{ fontSize: "16px" }}>
            {card.name}
          </span>
          <span
            className="bcc-mono block truncate text-ink-soft"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            @{card.handle.toUpperCase()}
          </span>
        </span>

        {hasRank && (
          <span
            className="bcc-mono shrink-0 border border-ink/30 bg-cardstock px-2 py-0.5 text-ink"
            style={{ fontSize: "9px", letterSpacing: "0.18em" }}
            aria-label={`Rank: ${rankLabel}`}
          >
            {rankLabel.toUpperCase()}
          </span>
        )}
      </Link>
    </li>
  );
}

function EmptyState({
  kicker,
  heading,
  hint,
}: {
  kicker: string;
  heading: string;
  hint: string;
}) {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {kicker}
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        {heading}
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        {hint}
      </p>
    </div>
  );
}
