"use client";

/**
 * CommunityCardGrid — a grid of community trading cards (card_kind
 * "community"): Communities ▸ All (the discovery list) and Communities ▸
 * Halls (when GET /halls carries each Hall's card).
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
import type { Card } from "@/lib/api/types";

export function CommunityCardGrid({ cards }: { cards: readonly Card[] }) {
  return (
    <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,minmax(0,316px))]">
      {cards.map((card) => (
        <CommunityCardCell key={`community-${card.id}`} card={card} />
      ))}
    </ul>
  );
}

const CommunityCardCell = memo(function CommunityCardCell({ card }: { card: Card }) {
  return (
    <li>
      <CommunityJoinCard card={card} />
    </li>
  );
});
