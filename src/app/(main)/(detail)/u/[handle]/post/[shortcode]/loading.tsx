"use client";

/**
 * loading.tsx — see the sibling `post/[id]/loading.tsx` doc comment for
 * why this exists. This is the route real feed-card clicks land on
 * (bcc-trust #82 rewrote `links.self` to the shortcode scheme), so it's
 * the one that matters most for the instant-open feel.
 */

import { PostBackButton } from "@/components/feed/PostBackButton";
import { PostDetail } from "@/components/feed/PostDetail";
import { PostDetailSkeleton } from "@/components/feed/PostDetailSkeleton";
import { PostRailRegistrar } from "@/components/feed/PostRailRegistrar";
import { useCachedFeedItemByPath } from "@/hooks/useCachedFeedItemByPath";

export default function PostByShortcodeLoading() {
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
