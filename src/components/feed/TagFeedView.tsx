"use client";

/**
 * TagFeedView — the /t/[tag] surface: posts carrying one PeepSo
 * hashtag.
 *
 * Thin composition layer. The data + all the loading/error/pagination
 * machinery live in useTagFeed + the shared <FeedBody> (exported from
 * FeedView). This file only adds the section header and the tag-scoped
 * empty tile, then spreads the query straight into FeedBody. No
 * business logic — the feed rows are server-shaped FeedItems rendered
 * as-is by FeedItemCard.
 */

import { FeedBody } from "@/components/feed/FeedView";
import { FEED_QUERY_KEY_ROOT, useTagFeed } from "@/hooks/useFeed";
import { LoadFailure } from "@/components/ui/LoadFailure";
import {
  shouldWithdrawOnDenial,
  useDenialGate,
  useReportDenial,
} from "@/lib/api/resource-denial";

export interface TagFeedViewProps {
  /** Hashtag without the leading "#" — the route strips it. */
  tag: string;
}

/**
 * The tag feed's denial gate. <FeedBody> takes the query as props and so
 * has no key; the key lives here, where the hook is called.
 */
export function TagFeedView({ tag }: TagFeedViewProps) {
  const gate = useDenialGate([...FEED_QUERY_KEY_ROOT, "tag", tag]);
  if (gate.withdrawn) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-10">
        <LoadFailure message={"You’re not allowed to read this tag feed."} />
      </section>
    );
  }
  return <TagFeedViewData tag={tag} onDenied={gate.withdraw} />;
}

function TagFeedViewData({ tag, onDenied }: { tag: string; onDenied: () => void }) {
  const query = useTagFeed(tag);
  useReportDenial(
    shouldWithdrawOnDenial(query.error, query.isRefetchError, query.data !== undefined),
    onDenied,
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-6">
      <header className="py-6">
        <p className="bcc-mono text-safety" style={{ letterSpacing: "0.18em" }}>
          FLOOR {"//"} HASHTAG
        </p>
        <h1 className="bcc-stencil mt-2 break-words text-bcc-text text-3xl sm:text-4xl">
          POSTS TAGGED #{tag}
        </h1>
      </header>

      <FeedBody {...query} emptyState={<TagFeedEmpty tag={tag} />} />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Quiet empty tile — replaces DiscoverPanel for a tag with no posts.
// Matches the feed's panel voice (bcc-panel + mono kicker + serif line).
// ─────────────────────────────────────────────────────────────────────

function TagFeedEmpty({ tag }: { tag: string }) {
  return (
    <div className="bcc-panel my-6 px-5 py-8 text-center">
      <p
        className="bcc-mono text-bcc-text-secondary"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOTHING ON FILE
      </p>
      <p className="font-serif italic text-bcc-text-secondary mt-3" style={{ fontSize: "15px" }}>
        No posts tagged #{tag} yet.
      </p>
    </div>
  );
}
