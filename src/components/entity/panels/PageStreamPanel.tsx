"use client";

/**
 * PageStreamPanel — the validator page's Activity tab: the operator's
 * everyday posts, newest first. Announcements are not here; they sit at the
 * top of the page (AnnouncementsTopSection).
 *
 * Reading is public and is not tied to who operates the validator today. A
 * post keeps its place and its label after its author stops being the
 * operator, so the feed is gated on nothing the viewer is or does.
 *
 * Writing is gated on `canPost`, the server's own answer from
 * `card.page_stream.can_post`. The composer is a sibling of the feed body so
 * a failed read never takes a half-written post with it.
 *
 * ## An unclaimed page
 *
 * `LockedStreamPanel` is what a never-claimed page shows, and it holds that
 * slot while the first read is in flight so those pages do not flash a
 * skeleton. A page whose claim lapsed can still have posts, and those stay:
 * if the server returns any, they render in place of the lock.
 *
 * ## Failure modes
 *
 * Same split as GroupFeedSection, and for the same reason: only a first-load
 * failure may replace the list. A failed refresh or a failed next page
 * annotates the posts already on screen. There is no denial gate, because
 * this route is public and declares no 403; `isPermissionDenial` only keeps
 * a Retry from being offered if one ever arrives.
 */

import { Composer } from "@/components/composer/Composer";
import { LockedStreamPanel } from "@/components/entity/LockedStreamPanel";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePageFeed } from "@/hooks/useFeed";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";

interface PageStreamPanelProps {
  pageId: number;
  pageName: string;
  canPost: boolean;
  /** `card.is_claimed === false`. */
  unclaimed: boolean;
  /** Shown on a claimed page with no posts. */
  emptyState: { title: string; body: string };
}

export function PageStreamPanel({
  pageId,
  pageName,
  canPost,
  unclaimed,
  emptyState,
}: PageStreamPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {canPost && (
        <Composer
          variant="inline"
          hosted
          pageId={pageId}
          groupScopeLabel={`POST ON ${pageName.toUpperCase()}`}
        />
      )}
      <PageStreamBody
        pageId={pageId}
        pageName={pageName}
        unclaimed={unclaimed}
        emptyState={emptyState}
      />
    </div>
  );
}

function PageStreamBody({
  pageId,
  pageName,
  unclaimed,
  emptyState,
}: Omit<PageStreamPanelProps, "canPost">) {
  const query = usePageFeed(pageId);

  if (query.isPending) {
    return unclaimed ? (
      <LockedStreamPanel pageName={pageName} />
    ) : (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28" count={3} />
      </div>
    );
  }

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "This page's posts are temporarily unavailable. Try again shortly.",
    },
    "Couldn't load this page's posts. Try again in a moment.",
  );

  const denied = isPermissionDenial(query.error);
  const refetchProps = denied ? {} : { onRetry: () => void query.refetch() };
  const nextPageProps = denied
    ? {}
    : { onRetry: () => void query.fetchNextPage() };

  if (query.isLoadingError) {
    return <LoadFailure message={failureCopy} {...refetchProps} />;
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  // Both empties are claims about what the server holds, and a failed read
  // does not support them.
  if (items.length === 0 && !query.isError) {
    if (unclaimed) return <LockedStreamPanel pageName={pageName} />;
    return (
      <div className="bcc-panel mx-auto w-full max-w-2xl p-8 text-center">
        <h2 className="bcc-stencil text-2xl text-bcc-text">{emptyState.title}</h2>
        <p className="mt-2 font-serif text-bcc-text-secondary">{emptyState.body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <FeedItemCard key={item.id} item={item} />
      ))}

      {query.isRefetchError && <LoadFailure message={failureCopy} {...refetchProps} />}

      {/* Cursor safety: while the NEXT page is failed, LOAD MORE is withdrawn
          so it cannot advance past the page that failed. */}
      {query.isFetchNextPageError ? (
        <LoadFailure message={failureCopy} {...nextPageProps} />
      ) : (
        query.hasNextPage &&
        !denied && (
          <button
            type="button"
            onClick={() => {
              if (!query.isFetchingNextPage) {
                void query.fetchNextPage();
              }
            }}
            disabled={query.isFetchingNextPage}
            className="bcc-stencil mx-auto mt-4 min-h-[44px] border border-bcc-border px-6 py-2.5 text-bcc-text disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )
      )}

      {/* "End of the feed" is a claim about the server having no more posts.
          A failed next page means we do not know that. */}
      {!query.hasNextPage && !query.isFetchNextPageError && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-bcc-text-secondary">
          End of the feed.
        </p>
      )}
    </div>
  );
}
