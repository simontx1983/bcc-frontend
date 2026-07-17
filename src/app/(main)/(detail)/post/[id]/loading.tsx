"use client";

/**
 * loading.tsx — Next renders this INSTANTLY on navigation while the
 * server segment (page.tsx's SSR fetch) streams in behind it, instead of
 * a dead screen for however long that fetch takes.
 *
 * Better than a bare skeleton: if the post is already in the client (the
 * common case — clicked off a feed card that's still mounted), render it
 * for real right away via useCachedFeedItemByPath. Comments stream in
 * behind CommentDrawer's own skeleton either way. Cold nav (shared link,
 * refresh) has nothing cached yet, so it falls back to the skeleton.
 */

import { PostBackButton } from "@/components/feed/PostBackButton";
import { PostDetail } from "@/components/feed/PostDetail";
import { PostDetailSkeleton } from "@/components/feed/PostDetailSkeleton";
import { PostRailRegistrar } from "@/components/feed/PostRailRegistrar";
import { useCachedFeedItemByPath } from "@/hooks/useCachedFeedItemByPath";

export default function PostLoading() {
  const cachedItem = useCachedFeedItemByPath();

  return (
    <div className="mx-auto max-w-2xl px-2 py-4 sm:px-0">
      <PostBackButton />
      {cachedItem !== null ? (
        <>
          <PostRailRegistrar author={cachedItem.author} feedId={cachedItem.id} />
          <PostDetail item={cachedItem} />
        </>
      ) : (
        <PostDetailSkeleton />
      )}
    </div>
  );
}
