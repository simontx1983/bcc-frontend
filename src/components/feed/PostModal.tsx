"use client";

/**
 * PostModal — wraps `PostDetail` in the shared `<Dialog>` for the
 * `(.)post/[id]` intercepting route. Closing (ESC, backdrop click, the
 * corner ESC button) calls `router.back()` so the URL returns to
 * wherever the feed card was clicked from, rather than navigating to
 * the full `/post/[id]` page.
 */

import { useRouter } from "next/navigation";

import { Dialog } from "@/components/ui/Dialog";
import { PostDetail } from "@/components/feed/PostDetail";
import type { FeedItem } from "@/lib/api/types";

export function PostModal({ item }: { item: FeedItem }) {
  const router = useRouter();

  return (
    <Dialog title="Post" bare onClose={() => router.back()} panelClassName="max-w-2xl max-h-[92vh] overflow-y-auto">
      <button
        type="button"
        onClick={() => router.back()}
        className="bcc-mono mb-2 inline-flex items-center gap-1 text-[11px] text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        ← Back
      </button>
      <PostDetail item={item} />
    </Dialog>
  );
}
