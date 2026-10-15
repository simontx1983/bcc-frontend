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
 *
 * Card actions:
 *   - Keep Tabs → toggles the viewer's follow on the card via
 *     watch/unwatch mutations; `isPulled` derives from the watching
 *     query so the button label reflects current state.
 *   - Review → navigates to the card's profile in compose mode,
 *     letting the destination page handle the composer modal.
 *   - View profile → handled inside CardFactory (Link).
 */

import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";

import { CardGrid } from "@/components/cards/CardGrid";
import { CardGridSkeleton } from "@/components/cards/CardGridSkeleton";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import { LoadFailure } from "@/components/ui/LoadFailure";
import type {
  BccApiError,
  Card,
  CardsListResponse,
} from "@/lib/api/types";

interface Props {
  query: UseInfiniteQueryResult<InfiniteData<CardsListResponse>, BccApiError>;
}

export function DirectoryGrid({ query }: Props) {
  // §γ — copy is keyed on err.code; never render err.message. This
  // component previously rendered ONE hardcoded sentence for every failure,
  // so a denial and a rate limit read identically and neither was keyed on
  // the code at all.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_unauthorized: "Sign in to browse the directory.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "The directory is temporarily unavailable. Try again shortly.",
      bcc_forbidden: "You can’t browse the directory.",
      bcc_permission_denied: "You can’t browse the directory.",
      bcc_blocked: "You can’t browse the directory.",
    },
    "The directory hit a snag. Try a different filter or refresh in a moment.",
  );

  // This component is handed the query rather than owning it, so it has no
  // query KEY and cannot host the withdrawal gate — see the note on
  // `DirectoryGrid` in the PR. Retry is still withheld on a denial, which
  // is the half that does not need the key.
  const denied = isPermissionDenial(query.error);
  const refetchProps = denied ? {} : { onRetry: () => void query.refetch() };
  const nextPageProps = denied
    ? {}
    : { onRetry: () => void query.fetchNextPage() };

  // ONLY a first-load failure may replace the grid. A blanket `isError` was
  // true for all three failures and returned here BEFORE reading
  // `data.pages`, so one failed LOAD MORE threw away results that had
  // loaded fine — and the filter controls above it were the only way back.
  if (query.isLoadingError) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-6 text-center">
        <LoadFailure message={failureCopy} {...refetchProps} />
      </div>
    );
  }

  if (query.isLoading) {
    return <CardGridSkeleton ariaLabel="Loading directory results" />;
  }

  // Flatten pages into a single Card[]. Each page is an independent
  // CardsListResponse — concat in order.
  const items: Card[] = (query.data?.pages ?? []).flatMap((p) => p.items);

  // "Filter’s too tight" is a claim about the SERVER having no matches.
  // A failed read does not support it — telling someone to loosen a
  // filter when the request actually failed sends them the wrong way.
  if (items.length === 0 && !query.isError) {
    return (
      <div className="bcc-panel mx-auto max-w-md p-8 text-center">
        <p className="bcc-mono text-safety">NO MATCHES</p>
        <h2 className="bcc-stencil mt-2 text-3xl text-bcc-text">
          Filter&rsquo;s too tight.
        </h2>
        <p className="mt-3 font-serif leading-relaxed text-bcc-text-secondary">
          Drop a tier, switch the kind, or clear the search. Plenty more
          on the floor.
        </p>
      </div>
    );
  }

  return (
    <>
      <CardGrid cards={items} />

      {/* A failed REFRESH keeps the grid and localises the recovery. */}
      {query.isRefetchError && (
        <div className="mt-8">
          <LoadFailure message={failureCopy} {...refetchProps} />
        </div>
      )}

      {/* Cursor safety: while the NEXT page is failed, LOAD MORE is
          withdrawn so it cannot advance past the page that failed. */}
      {query.isFetchNextPageError ? (
        <div className="mt-8">
          <LoadFailure message={failureCopy} {...nextPageProps} />
        </div>
      ) : (
        query.hasNextPage &&
        !denied && (
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
        )
      )}
    </>
  );
}
