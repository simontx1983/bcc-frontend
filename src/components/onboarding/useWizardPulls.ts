"use client";

/**
 * useWizardPulls — pulled-state machine driven by the server.
 * Extracted from OnboardingWizard.tsx (Phase 3.3 god-component split);
 * logic unchanged.
 *
 * Source of truth split:
 *   - `isPulled(cardId)` reads the watching query (`useWatching()`). This
 *     is the *real* "is this in my watchlist right now" state — it
 *     correctly shows pre-existing watchlist rows from earlier sessions
 *     as already-pulled.
 *   - `pulledCount` + `snapshot()` track ONLY this wizard session's
 *     pulls. The §O1 dopamine moment is a celebration of what the
 *     user just did, not their lifetime collection. We can't derive
 *     the visual `card_tier` from a generic WatchingItem (which only
 *     carries the raw reputation tier per §A4) — but every pull made
 *     during the wizard goes through a Card view-model that already
 *     carries the server-computed `card_tier`. Snapshot reads the
 *     session map; pre-existing pulls don't appear (correct).
 *
 * Optimistic overlay: while a pull or unpull is IN FLIGHT, the
 * `isPulled` view flips to the target state for crisp UI; the click
 * is gated when pending.
 */

import { useMemo, useState } from "react";

import { useWatching } from "@/hooks/useWatching";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import type { Card, CardTier } from "@/lib/api/types";

export interface WizardPullsApi {
  isPulled: (cardId: number) => boolean;
  isPending: (cardId: number) => boolean;
  errorFor: (cardId: number) => string | null;
  toggle: (card: Card) => void;
  /** Count of cards pulled IN THIS WIZARD SESSION (not lifetime watchlist size). */
  pulledCount: number;
  /** True while ANY pull/unpull mutation is in flight. Gates wizard nav. */
  anyPending: boolean;
  /** Session-only snapshot of pulled cards (id + card_tier) for the dopamine step. */
  snapshot: () => ReadonlyArray<{ id: number; tier: CardTier }>;
}

export function useWizardPulls(): WizardPullsApi {
  const pullMut = useWatchMutation();
  const unpullMut = useUnwatchMutation();

  // Page size 50: comfortable headroom for the wizard's <=12 surfaced
  // cards. A larger pre-existing watchlist won't change the wizard's
  // state machine — we only key by card_id.
  const watching = useWatching({ page_size: 50 });

  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  // Session-only map of cards pulled during THIS wizard run. Value is
  // the server-computed `card_tier` from the Card view-model, captured
  // at successful pull time. Unpull during the same session removes
  // the entry. State (not ref) so consumers re-render when the count
  // changes.
  const [sessionPulls, setSessionPulls] = useState<ReadonlyMap<number, CardTier>>(
    new Map()
  );

  // V1.6 follows-by-card-id index. Carries the `source` discriminator
  // so unpull routes to the correct table (peepso vs. bcc_page_follows)
  // because their follow_id auto-increment ranges overlap.
  const followIds = useMemo<ReadonlyMap<number, { follow_id: number; source: "peepso" | "page" }>>(() => {
    const map = new Map<number, { follow_id: number; source: "peepso" | "page" }>();
    if (watching.data !== undefined) {
      for (const item of watching.data.items) {
        map.set(item.card_id, {
          follow_id: item.follow_id,
          source: item.follow_source ?? "peepso",
        });
      }
    }
    return map;
  }, [watching.data]);

  const setPendingFor = (cardId: number, isPending: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  };

  const setErrorFor = (cardId: number, message: string | null) => {
    setErrors((prev) => {
      const next = new Map(prev);
      if (message === null) {
        next.delete(cardId);
      } else {
        next.set(cardId, message);
      }
      return next;
    });
  };

  const recordSessionPull = (cardId: number, tier: CardTier) => {
    setSessionPulls((prev) => {
      const next = new Map(prev);
      next.set(cardId, tier);
      return next;
    });
  };

  const dropSessionPull = (cardId: number) => {
    setSessionPulls((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  };

  const toggle = (card: Card) => {
    setErrorFor(card.id, null);
    if (pending.has(card.id)) return;

    const entry = followIds.get(card.id);
    setPendingFor(card.id, true);

    if (entry !== undefined) {
      unpullMut.mutate({ follow_id: entry.follow_id, source: entry.source }, {
        onSuccess: () => dropSessionPull(card.id),
        onError: (err) => setErrorFor(card.id, err.message),
        onSettled: () => setPendingFor(card.id, false),
      });
    } else {
      pullMut.mutate(
        { target_kind: card.card_kind, target_id: card.id },
        {
          onSuccess: () => recordSessionPull(card.id, card.card_tier),
          onError: (err) => setErrorFor(card.id, err.message),
          onSettled: () => setPendingFor(card.id, false),
        }
      );
    }
  };

  const isPulled = (cardId: number): boolean => {
    const isWatched = followIds.has(cardId);
    return pending.has(cardId) ? !isWatched : isWatched;
  };

  return {
    isPulled,
    isPending: (cardId: number) => pending.has(cardId),
    errorFor: (cardId: number) => errors.get(cardId) ?? null,
    toggle,
    pulledCount: sessionPulls.size,
    anyPending: pending.size > 0,
    snapshot: () => {
      const out: Array<{ id: number; tier: CardTier }> = [];
      for (const [cardId, tier] of sessionPulls) {
        out.push({ id: cardId, tier });
      }
      return out;
    },
  };
}
