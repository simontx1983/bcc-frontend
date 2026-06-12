"use client";

/**
 * CommunityCardGrid — the /communities discovery grid, rendered as
 * CardFactory trading cards (card_kind "community").
 *
 * Layout: fixed-width 316px tracks (`.bcc-card` is intrinsically
 * 316×440 — the 3D flip depends on a fixed footprint), auto-fit so the
 * column count follows the viewport, justify-center so partial rows
 * stay centered. Same approach as CardGrid for the directory.
 *
 * All join behavior lives in CommunityJoinCard (shared with the
 * GroupDetailShell hero) — this file only owns the grid layout and
 * per-item memoization.
 */

import { memo } from "react";

import { CommunityJoinCard } from "@/components/communities/CommunityJoinCard";
import type { GroupDiscoveryItem } from "@/lib/api/types";

export function CommunityCardGrid({ items }: { items: GroupDiscoveryItem[] }) {
  return (
    <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]">
      {items.map((item) => (
        <CommunityCardCell key={`community-${item.group_id}`} item={item} />
      ))}
    </ul>
  );
}

const CommunityCardCell = memo(function CommunityCardCell({
  item,
}: {
  item: GroupDiscoveryItem;
}) {
  return (
    <li>
      <CommunityJoinCard card={item.card} />
    </li>
  );
});
