"use client";

/**
 * useWizardPulls — pulled-state machine driven by the server.
 * Extracted from OnboardingWizard.tsx (Phase 3.3 god-component split);
 * logic unchanged.
 *
 * Source of truth split:
 *   - `isPulled(card)` reads the card's own `viewer_is_watching` /
 *     `viewer_watch` (F-255), then the outcome of this session's toggles
 *     from the mutation responses. It used to search the first page of
 *     /me/watching (50 items) keyed on `card_id`, which both missed watches
 *     past the 50th and never matched a claimed page (card_id there is the
 *     owner's user id, not the page id), so a pulled page flipped back.
 *   - `pulledCount` + `snapshot()` track ONLY this wizard session's
 *     pulls. The §O1 dopamine moment is a celebration of what the
 *     user just did, not their lifetime collection. We can't derive
 *     the visual `reputation_tier` from a generic WatchingItem (which only
 *     carries the raw reputation tier per §A4) — but every pull made
 *     during the wizard goes through a Card view-model that already
 *     carries the server-computed `reputation_tier`. Snapshot reads the
 *     session map; pre-existing pulls don't appear (correct).
 *
 * Optimistic overlay: while a pull or unpull is IN FLIGHT, the
 * `isPulled` view flips to the target state for crisp UI; the click
 * is gated when pending.
 */

import { useState } from "react";

import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import { humanizeCode } from "@/lib/api/errors";
import { FOLLOW_COPY } from "@/lib/copy";
import type { Card, ReputationTier, ViewerWatch } from "@/lib/api/types";

/**
 * §γ — pull/unpull failures render the returned string inline; copy is
 * keyed on err.code, never err.message.
 */
function humanizePullError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to pull cards.",
      // F-236: a block either way, or a suspended viewer. Generic.
      bcc_forbidden: FOLLOW_COPY.refused,
      bcc_rate_limited: "Too fast — wait a moment and try again.",
      bcc_unavailable: "Pulls are temporarily unavailable. Try again shortly.",
    },
    "Couldn't update this pull. Try again.",
  );
}

export interface WizardPullsApi {
  isPulled: (card: Card) => boolean;
  isPending: (cardId: number) => boolean;
  errorFor: (cardId: number) => string | null;
  toggle: (card: Card) => void;
  /** Count of cards pulled IN THIS WIZARD SESSION (not lifetime watchlist size). */
  pulledCount: number;
  /** True while ANY pull/unpull mutation is in flight. Gates wizard nav. */
  anyPending: boolean;
  /** Session-only snapshot of pulled cards (id + reputation_tier) for the dopamine step. */
  snapshot: () => ReadonlyArray<{ id: number; tier: ReputationTier }>;
}

export function useWizardPulls(): WizardPullsApi {
  const pullMut = useWatchMutation();
  const unpullMut = useUnwatchMutation();

  // This session's toggle outcomes, from the mutation responses: a watch
  // stores the follow it created (or found: `already_watching`), an unwatch
  // stores null. Absent → the card's own server answer.
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, ViewerWatch | null>>(new Map());
  const setOutcome = (cardId: number, watch: ViewerWatch | null) => {
    setOutcomes((prev) => new Map(prev).set(cardId, watch));
  };
  const currentWatch = (card: Card): ViewerWatch | null => {
    if (outcomes.has(card.id)) return outcomes.get(card.id) ?? null;
    return card.viewer_is_watching === true ? (card.viewer_watch ?? null) : null;
  };
  const watchedNow = (card: Card): boolean =>
    outcomes.has(card.id) ? outcomes.get(card.id) !== null : card.viewer_is_watching === true;

  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  // Session-only map of cards pulled during THIS wizard run. Value is
  // the server-computed `reputation_tier` from the Card view-model, captured
  // at successful pull time. Unpull during the same session removes
  // the entry. State (not ref) so consumers re-render when the count
  // changes.
  const [sessionPulls, setSessionPulls] = useState<ReadonlyMap<number, ReputationTier>>(
    new Map()
  );

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

  const recordSessionPull = (cardId: number, tier: ReputationTier) => {
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

    const entry = currentWatch(card);
    if (watchedNow(card) && entry === null) {
      // Watched, but no handle to unwatch it with.
      setErrorFor(card.id, humanizePullError(null));
      return;
    }
    setPendingFor(card.id, true);

    if (entry !== null) {
      unpullMut.mutate({ follow_id: entry.follow_id, source: entry.source }, {
        onSuccess: () => {
          setOutcome(card.id, null);
          dropSessionPull(card.id);
        },
        onError: (err) => setErrorFor(card.id, humanizePullError(err)),
        onSettled: () => setPendingFor(card.id, false),
      });
    } else {
      pullMut.mutate(
        { target_kind: card.card_kind, target_id: card.id },
        {
          onSuccess: (res) => {
            setOutcome(card.id, {
              follow_id: res.item.follow_id,
              source: res.item.follow_source ?? "peepso",
            });
            recordSessionPull(card.id, card.reputation_tier);
          },
          onError: (err) => setErrorFor(card.id, humanizePullError(err)),
          onSettled: () => setPendingFor(card.id, false),
        }
      );
    }
  };

  const isPulled = (card: Card): boolean => {
    const isWatched = watchedNow(card);
    return pending.has(card.id) ? !isWatched : isWatched;
  };

  return {
    isPulled,
    isPending: (cardId: number) => pending.has(cardId),
    errorFor: (cardId: number) => errors.get(cardId) ?? null,
    toggle,
    pulledCount: sessionPulls.size,
    anyPending: pending.size > 0,
    snapshot: () => {
      const out: Array<{ id: number; tier: ReputationTier }> = [];
      for (const [cardId, tier] of sessionPulls) {
        out.push({ id: cardId, tier });
      }
      return out;
    },
  };
}
