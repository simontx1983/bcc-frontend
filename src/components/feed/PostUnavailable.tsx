"use client";

/**
 * PostUnavailable — what a post permalink shows when the server could not
 * read the post (F-275): `GET /feed/{id}`, numeric or shortcode, answered
 * 503 `bcc_unavailable`.
 *
 * ## What it must never say
 *
 * "Post not found". A read that did not run says nothing about whether the
 * post exists; only a 404 does, and the page sends that to `notFound()`
 * before it gets here. The contract says the same in as many words: the
 * client offers a retry, not "post not found".
 *
 * ## Why the Retry is a client read, not a page reload
 *
 * The failure happened during the SERVER render, so the profile page's
 * recovery (`router.refresh()`, labelled a reload because it can turn into
 * a hard document load) would be the obvious copy. It is not needed here:
 * `GET /feed/{id}` has a client twin, so Retry re-reads the post in place
 * through React Query and swaps it in on success. Nothing on the page is
 * discarded, and LoadFailure's plain "Retry" is the honest label.
 *
 * A press while a read is already in flight joins that read instead of
 * cancelling and re-sending it. React Query already does that for a query
 * that holds no data, which is the only state this control shows in;
 * `cancelRefetch: false` keeps it true if that ever changes.
 *
 * ## What the viewer already has stays on screen
 *
 * `loading.tsx` renders the post straight from the feed cache while the
 * server segment streams in. Swapping that for an error when the server
 * read fails would take away a post the viewer is already reading, so a
 * cached copy, found the same way loading.tsx finds it, is shown instead.
 * The app's rule elsewhere is the same: a failed refresh keeps what loaded.
 *
 * ## After a retry
 *
 * - Succeeded: the post, rendered as the page itself renders it.
 * - 404, 403 or 400: that identical read cannot succeed, so the state is
 *   terminal and offers no Retry (`isNonRetryableFixedReadFailure`).
 * - Anything else: the failure copy again, keyed on the code, with Retry.
 */

import { PostDetail } from "@/components/feed/PostDetail";
import { PostRailRegistrar } from "@/components/feed/PostRailRegistrar";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { useCachedFeedItemByPath } from "@/hooks/useCachedFeedItemByPath";
import { useFeedItemRecovery } from "@/hooks/useFeed";
import { humanizeCode, isNonRetryableFixedReadFailure } from "@/lib/api/errors";

/** The server's 503, in the house phrasing. Exported for the tests. */
export const POST_UNAVAILABLE_COPY = "This post is temporarily unavailable. Try again.";

/** A retry that answered 404/403/400: there is nothing to retry. */
export const POST_NOT_AVAILABLE_COPY = "This post isn’t available.";

export function PostUnavailable({
  routeId,
  focusComposer = false,
}: {
  /** The id from the URL: numeric, or the 8-letter shortcode. */
  routeId: string;
  focusComposer?: boolean;
}) {
  const recovery = useFeedItemRecovery(routeId);
  const cached = useCachedFeedItemByPath();
  const item = recovery.data ?? cached;

  if (item !== null) {
    return (
      <>
        <PostRailRegistrar author={item.author} feedId={item.id} />
        <PostDetail item={item} focusComposer={focusComposer} />
      </>
    );
  }

  if (isNonRetryableFixedReadFailure(recovery.error)) {
    return <LoadFailure message={POST_NOT_AVAILABLE_COPY} />;
  }

  // §γ — copy is keyed on err.code; never render err.message. Before any
  // retry there is no client error, and the server's answer was the 503.
  const message =
    recovery.error === null
      ? POST_UNAVAILABLE_COPY
      : humanizeCode(
          recovery.error,
          {
            bcc_unavailable: POST_UNAVAILABLE_COPY,
            bcc_rate_limited: "Loading too fast — give it a moment and try again.",
          },
          "Couldn't load this post. Try again in a moment.",
        );

  return (
    <div aria-busy={recovery.isFetching || undefined}>
      <LoadFailure
        message={message}
        onRetry={() => {
          void recovery.refetch({ cancelRefetch: false });
        }}
      />
    </div>
  );
}
