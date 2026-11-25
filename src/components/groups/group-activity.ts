/**
 * The §4.7.1 `activity` block, read the one way every surface reads it.
 *
 * The server can send the block with no numbers at all: when it can't
 * tell which posts moderation has hidden, `posts_last_7d`, `heat`,
 * `heat_label` and `last_activity_at` all come back null rather than a
 * guessed count. A null is "we don't know", never "quiet" and never 0,
 * so:
 *   - `hasHeat()` says whether there is a heat bucket to show at all;
 *   - `sortByHeat()` keeps the anti-ghost-town order (hot → warm → cold,
 *     then posts desc) and puts what it can't rank last, in the server's
 *     order.
 *
 * Plain module (no "use client"), so server and client components share it.
 */

import type { GroupActivity } from "@/lib/api/types";

/** An activity block the server could read. */
export type ReadableActivity = GroupActivity & {
  heat: NonNullable<GroupActivity["heat"]>;
  heat_label: string;
};

/** True when the server sent a heat bucket and its label. */
export function hasHeat(activity: GroupActivity): activity is ReadableActivity {
  return activity.heat !== null && activity.heat_label !== null && activity.heat_label !== "";
}

const HEAT_ORDER: Record<NonNullable<GroupActivity["heat"]>, number> = {
  hot: 0,
  warm: 1,
  cold: 2,
};

/** Unknown heat sorts after every known bucket. */
const UNKNOWN_RANK = Object.keys(HEAT_ORDER).length;

/**
 * Hot → warm → cold, then posts in the last 7 days, most first (contract
 * §4.7.1). A row with no heat, or no post count, goes after the rows that
 * have one; ties keep the server's order (Array.prototype.sort is stable).
 */
export function sortByHeat<T extends { activity: GroupActivity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const heatDelta = heatRank(a.activity) - heatRank(b.activity);
    if (heatDelta !== 0) return heatDelta;
    const aPosts = a.activity.posts_last_7d;
    const bPosts = b.activity.posts_last_7d;
    if (aPosts === null || bPosts === null) {
      return (aPosts === null ? 1 : 0) - (bPosts === null ? 1 : 0);
    }
    return bPosts - aPosts;
  });
}

function heatRank(activity: GroupActivity): number {
  return activity.heat === null ? UNKNOWN_RANK : HEAT_ORDER[activity.heat];
}
