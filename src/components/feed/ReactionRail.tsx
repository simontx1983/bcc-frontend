"use client";

/**
 * ReactionRail — three §D5 reaction buttons under a feed item.
 *
 * Behaviour:
 *   - Click an idle button → set that reaction (POST /reactions).
 *   - Click your active reaction → remove it (DELETE /reactions/:id).
 *   - Click a different button while another is active → swap.
 *     Server's set endpoint is idempotent on swap; the optimistic
 *     update flips counts in one cache mutation.
 *
 * §N1 dual-label rule:
 *   Brand names (Solid / Vouch / Stand behind) ride alongside
 *   plain-English helpers (Agree / Back this / Stake my rep). Helpers
 *   render as italic sub-text until the user is "familiar"
 *   (`bcc_ui_familiar` user-meta flag, set server-side after
 *   onboarding + 3 active days). The flag isn't surfaced in the feed
 *   item view-model yet, so V1 always renders the helpers — when the
 *   `ux_helpers` block lands on the response, gate this on it.
 */

import { type MouseEvent } from "react";

import {
  useRemoveReactionMutation,
  useSetReactionMutation,
} from "@/hooks/useReactions";
import type { FeedItem, ReactionKind } from "@/lib/api/types";

interface ReactionDef {
  kind: ReactionKind;
  brand: string;
  helper: string;
}

const REACTIONS: ReadonlyArray<ReactionDef> = [
  { kind: "solid",        brand: "Solid",        helper: "Agree" },
  { kind: "vouch",        brand: "Vouch",        helper: "Back this" },
  { kind: "stand_behind", brand: "Stand behind", helper: "Stake my rep" },
];

export function ReactionRail({ item }: { item: FeedItem }) {
  const setMut    = useSetReactionMutation();
  const removeMut = useRemoveReactionMutation();
  const isPending = setMut.isPending || removeMut.isPending;

  const viewerReaction = item.reactions.viewer_reaction;
  const counts         = item.reactions.counts;

  const handleClick =
    (kind: ReactionKind) => (event: MouseEvent<HTMLButtonElement>) => {
      // Stop propagation in case the rail ends up inside a future
      // clickable container (e.g. card-body click navigation).
      event.stopPropagation();
      if (isPending) return;

      if (viewerReaction === kind) {
        removeMut.mutate(item.id);
      } else {
        setMut.mutate({ feed_id: item.id, reaction: kind });
      }
    };

  return (
    <div className="flex items-center gap-2">
      {REACTIONS.map(({ kind, brand, helper }) => {
        const count    = counts[kind] ?? 0;
        const isActive = viewerReaction === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={handleClick(kind)}
            disabled={isPending}
            aria-pressed={isActive}
            title={`${brand} — ${helper}`}
            className={
              // Touch target: min-h-[36px] hits the practical phone
              // tap floor without making desktop feel chunky. Helpers
              // ride visible at all widths until §N1 familiarity gates
              // them off (the view-model doesn't yet expose the flag).
              "bcc-mono inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed " +
              (isActive
                ? "border-safety bg-safety/10 text-ink"
                : "border-cardstock-edge/40 bg-cardstock text-ink-soft hover:border-cardstock-edge hover:text-ink")
            }
          >
            <span className="font-medium">{brand}</span>
            <span className="text-ink-soft/70 italic">{helper}</span>
            {count > 0 && (
              <span className={isActive ? "text-ink" : "text-ink-soft/80"}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
