/**
 * HeatBadge — renders the §4.7.1 / §4.7.4 `activity` block as a small
 * "Hot · 14/7d" pill. Lives in components/groups/ alongside
 * VerificationBadge so any group-rendering surface can pick it up.
 *
 * Server contract (§A2 / §S):
 *   - `activity.heat_label` is the display string. Render verbatim —
 *     no client-side enum→label mapping.
 *   - `activity.heat` is the typed enum. Used here only to choose a
 *     Tailwind color class; this is presentation styling keyed off a
 *     stable enum value, not a label decision.
 *   - Either can be null when the server couldn't count the posts
 *     (group-activity.ts). Then the badge renders nothing: no "Quiet",
 *     no 0. A post count that is null on its own drops just the count.
 *
 * No `"use client"` — pure presentation. Safe to render in server
 * components.
 */

import { hasHeat } from "@/components/groups/group-activity";
import type { GroupActivity } from "@/lib/api/types";

const COLOR_BY_HEAT: Record<NonNullable<GroupActivity["heat"]>, string> = {
  hot:  "text-bcc-text-safety",
  warm: "text-blueprint",
  cold: "text-bcc-text-secondary",
};

export function HeatBadge({ activity }: { activity: GroupActivity }) {
  if (!hasHeat(activity)) return null;

  return (
    <span
      className={
        "bcc-mono text-[10px] uppercase tracking-[0.16em] " +
        COLOR_BY_HEAT[activity.heat]
      }
    >
      {activity.heat_label}
      {activity.posts_last_7d !== null && <> · {activity.posts_last_7d}/7d</>}
    </span>
  );
}
