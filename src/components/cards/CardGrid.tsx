"use client";

/**
 * CardGrid — presentational card grid with viewer-watch wiring.
 *
 * Extracted from `DirectoryGrid` so the same CardFactory-grid-with-watch
 * body renders at every member/entity card surface (the /members
 * directory, the entity "Watchers" panel, the profile "Watching" panel)
 * without duplicating the watch plumbing or the `auto-fit,316px` grid.
 *
 * Owns:
 *   - each card's watch state and toggle (`useViewerWatch`), read from
 *     the card's own `viewer_is_watching` / `viewer_watch` (F-255). It
 *     used to search the first page of /me/watching (50 items), so past
 *     the 50th watch a card read "Watch" and could not be unwatched.
 *   - the responsive `[grid-template-columns:repeat(auto-fit,minmax(0,316px))]`
 *     track (cards are a fixed 316px; the perspective + 3D flip rely on
 *     a stable width).
 *
 * Does NOT own:
 *   - data fetching / pagination — the caller passes a flat `cards`
 *     array (DirectoryGrid flattens its infinite query; the panels
 *     accumulate offset pages).
 *
 * Each card is wrapped in a `memo()`'d cell keyed by `${kind}-${id}` so
 * a watchlist change or a sibling re-render doesn't re-render every
 * card. Callback props are stable (`useCallback`).
 */

import { memo, useCallback, useMemo, useState } from "react";

import { CardFactory } from "@/components/cards/CardFactory";
import { useViewerWatch, WATCH_UNKNOWN_COPY } from "@/hooks/useViewerWatch";
import type { Card } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

interface CardGridProps {
  cards: Card[];
}

export function CardGrid({ cards }: CardGridProps) {
  // F-236: one failure line at a time — the card clicked last owns it, so
  // a new click elsewhere clears the previous card's line.
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  return (
    // `bcc-card` is a fixed 316px wide (perspective + 3D flip rely on a
    // stable card width). An `auto-fit` track packs only as many 316px
    // columns as the available width admits, so cards never overlap
    // regardless of sidebar / breakpoint. `justify-center` centers any
    // leftover space when the row isn't full.
    <ul className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,minmax(0,316px))]">
      {cards.map((card) => (
        <CardGridCell
          key={`${card.card_kind}-${card.id}`}
          card={card}
          showsFailure={lastClicked === `${card.card_kind}-${card.id}`}
          onClicked={setLastClicked}
        />
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CardGridCell — memoized per-card cell. Owns its card's watch state, so a
// toggle re-renders only that cell.
// ─────────────────────────────────────────────────────────────────────

const CardGridCell = memo(function CardGridCell({
  card,
  showsFailure,
  onClicked,
}: {
  card: Card;
  showsFailure: boolean;
  onClicked: (key: string) => void;
}) {
  const watch = useViewerWatch(card);
  const { toggle } = watch;
  const key = `${card.card_kind}-${card.id}`;
  const onPull = useCallback(() => {
    onClicked(key);
    toggle();
  }, [onClicked, key, toggle]);

  // Unknown watch state (the server could not tell): never offer "Watch".
  // Reuse the card's own disabled-with-reason path by denying can_watch
  // for this render, unless the server already denies it for its own
  // reason (anonymous, own card, community cards).
  const shownCard = useMemo<Card>(() => {
    if (!watch.unknown || !isAllowed(card.permissions, "can_watch")) return card;
    return {
      ...card,
      permissions: {
        ...card.permissions,
        can_watch: { allowed: false, unlock_hint: WATCH_UNKNOWN_COPY },
      },
    } as Card;
  }, [card, watch.unknown]);

  // F-236: a refused or failed toggle shows one line under the card, keyed
  // on the error code (never err.message), cleared by the next click.
  // The line sits OUTSIDE the fixed-size card, as a block sibling in the
  // cell; the card itself keeps its exact footprint.
  return (
    <li>
      <CardFactory card={shownCard} isPulled={watch.watching} onPull={onPull} />
      {showsFailure && watch.error !== null && (
        <p
          role="status"
          className="bcc-mono mt-2 text-center text-[11px] leading-snug text-[var(--bcc-text-secondary)]"
        >
          {watch.error}
        </p>
      )}
    </li>
  );
});
