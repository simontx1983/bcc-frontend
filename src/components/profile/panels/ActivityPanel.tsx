"use client";

/**
 * ActivityPanel — per-user wall (§3.1 Activity tab on /u/:handle).
 *
 * Backed by GET /users/:handle/activity, the per-author slice of the
 * same activity stream that drives the Floor feed. Renders rows
 * through <FeedItemCard> so the wall and the Floor look identical —
 * a wall is just a one-author lens on the same data.
 *
 * Owner affordance: when `isOwner` is true, the Composer mounts above
 * the activity list so a user can post without leaving their wall.
 * The Composer's `onSuccess` invalidates USER_ACTIVITY_QUERY_KEY_ROOT
 * (wired in useCreatePostMutation) so a fresh post lands as the top
 * row in 200-300ms. Other viewers see the read-only list.
 *
 * Pagination: cursor (mirrors the Floor feed). "Load more" lives at
 * the bottom; no auto-scroll loading on a profile tab — the tab is
 * one of five, scroll behavior should be predictable.
 *
 * Empty state per §N10: tells the visitor what would appear here once
 * the user posts, rather than reading as a missing surface.
 */

import { Composer } from "@/components/composer/Composer";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { LivingHeader } from "@/components/profile/LivingHeader";
import { useUserActivity } from "@/hooks/useUserActivity";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode } from "@/lib/api/errors";
import type { MemberLiving, MemberProgression } from "@/lib/api/types";

export function ActivityPanel({
  handle,
  isOwner = false,
  living,
  progression,
}: {
  handle: string;
  isOwner?: boolean;
  /** Own-profile-only "today's impact" + streak data. Renders at the
   *  top of the activity panel as the LIVE SHIFT block. Server only
   *  ships these on is_self; pass undefined for visitor views. */
  living?: MemberLiving | undefined;
  progression?: MemberProgression | undefined;
}) {
  const query = useUserActivity(handle);

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_unauthorized: "Sign in to view this wall.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "This wall is temporarily unavailable. Try again shortly.",
    },
    "Couldn't load this wall. Try again in a moment.",
  );

  // Which failure this is decides both what survives on screen and what
  // the recovery control must call. A blanket `isError` is true for all
  // three, and this panel used to branch on it BEFORE reading
  // `data.pages` — so one failed LOAD MORE replaced an entire loaded
  // wall with an error, measured at rows=2 → rows=0.
  //
  //   isLoadingError       — the FIRST fetch failed; there is nothing to
  //                          keep, and the fix is refetch().
  //   isFetchNextPageError — a LOAD MORE failed; `data.pages` still holds
  //                          every page already fetched, and the fix is
  //                          fetchNextPage() to resume that same cursor.
  //   isRefetchError       — a REFRESH of the loaded pages failed. Highly
  //                          reachable here: five call sites invalidate
  //                          USER_ACTIVITY_QUERY_KEY_ROOT (Composer,
  //                          useCreatePost ×3, useComments, useSetPhotoAlt),
  //                          and the app-wide `retry: 1` means two
  //                          consecutive failures surface it. Pages are
  //                          retained, so the fix is refetch() — NOT
  //                          fetchNextPage(), which would append instead
  //                          of refreshing.
  //
  // Mirrors PhotosPanel and UserBlogList, which already discriminate.
  //
  // The recovery control keeps LoadFailure's shared "Retry" wording
  // rather than the "Try again" this panel used to render inline. The
  // Account slice is the one documented exception to that default — it
  // sits beside background-refetch banners that already say "Try again"
  // — and a closed-inventory test pins the exception to those two files.
  // Nothing here sits beside such a banner, so there is no reason to
  // widen it.
  if (query.isLoadingError) {
    return (
      <div className="py-8">
        <LoadFailure
          message={failureCopy}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="py-8">
        <p className="bcc-mono text-bcc-text-secondary">Loading activity…</p>
      </div>
    );
  }

  const items = query.data.pages.flatMap((page) => page.items);
  // LIVE SHIFT — own-profile "today's impact" + streak panel.
  // Pulled in from the FILE 0A SectionFrame above the tab strip per
  // the 2026-05-14 reorganization. Sits ABOVE the composer so the
  // own-profile view reads: live status → write something → recent
  // posts.
  const liveShiftBlock = isOwner && living !== undefined ? (
    <LivingHeader
      living={living}
      {...(progression !== undefined ? { progression } : {})}
    />
  ) : null;

  // Empty stays success-only: a failed refresh is not a quiet wall.
  if (items.length === 0 && !query.isError) {
    return (
      <>
        {liveShiftBlock}
        {isOwner && <Composer variant="inline" defaultMode="status" />}
        <ActivityEmpty />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {liveShiftBlock}
      {isOwner && <Composer variant="inline" defaultMode="status" />}
      {items.map((item) => (
        <FeedItemCard key={item.id} item={item} />
      ))}

      {/* A failed REFRESH is not a failed cursor. The retained pages and
          the cursor derived from the last of them are still coherent, so
          advancing cannot skip anything — LOAD MORE deliberately stays
          available below, and this control refetches. */}
      {query.isRefetchError && (
        <LoadFailure
          message={failureCopy}
          onRetry={() => void query.refetch()}
        />
      )}

      {/* Cursor safety: while the NEXT cursor is failed, LOAD MORE is
          withdrawn so it cannot advance past — and skip — the page that
          failed. Retry resumes that same cursor via fetchNextPage();
          ordinary paging returns once the query is progressing again. */}
      {query.isFetchNextPageError ? (
        <LoadFailure
          message={failureCopy}
          onRetry={() => void query.fetchNextPage()}
        />
      ) : (
        query.hasNextPage && (
          <button
            type="button"
            onClick={() => { void query.fetchNextPage(); }}
            disabled={query.isFetchingNextPage}
            className="bcc-stencil mx-auto mt-4 border border-bcc-border px-6 py-2.5 text-bcc-text transition hover:border-bcc-border-strong disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )
      )}

      {/* "End of the wall" is a claim about the SERVER having no more
          rows. A failed next page means we do not know that, so the
          claim is withheld until the cursor is healthy again. */}
      {!query.hasNextPage && !query.isFetchNextPageError && items.length > 0 && (
        <p className="bcc-mono mt-4 text-center text-bcc-text-secondary">
          End of the wall.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ActivityEmpty — most users have a quiet wall when they first land.
// Frame the empty state as "nothing yet" rather than "missing feature."
// ─────────────────────────────────────────────────────────────────────

function ActivityEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">QUIET WALL</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        Nothing on file yet.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Reviews, blog posts, claimed pages, and pulled batches all show
        up here. Once this member posts on the floor, it lands on this
        wall.
      </p>
    </div>
  );
}
