"use client";

/**
 * PostRailRegistrar — invisible bridge that feeds the `/post/[id]` server
 * page's author + id into the RightRail slot so the sidebar can render the
 * post-specific rail (author card + more-from-author + ads). Rendered by
 * the permalink page; the actual widgets live in `PostRightRail`.
 */

import { useRegisterRightRail } from "@/components/layout/RightRailContext";
import type { FeedAuthor } from "@/lib/api/types";

export function PostRailRegistrar({ author, feedId }: { author: FeedAuthor; feedId: string }) {
  useRegisterRightRail({ author, feedId });
  return null;
}
