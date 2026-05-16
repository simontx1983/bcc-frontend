"use client";

/**
 * Watch / unwatch mutation hooks.
 *
 * Two raw mutations — one per HTTP verb. Composition (toggling, error
 * presentation, per-card pending state) lives in the consumer.
 * Keeping these mutations granular means future surfaces (the watchlist
 * page, the Floor feed's inline watch control, the card-detail page)
 * can compose differently without subclassing or option-juggling.
 *
 * Cache invalidation: both mutations invalidate the entire `watching`
 * query namespace on settle (success OR error — invalidating on error
 * recovers from races where a 429 fires AFTER the row was written).
 * Any active `useWatching()` consumer refetches automatically.
 *
 * No in-mutation optimistic update — the consumer applies its own
 * optimistic state because the FOLLOW_ID it needs back for unwatch only
 * exists after the server responds. The wizard's `useWizardPulls`
 * derives "watching" state from the watching query and overlays a
 * pending-flip for in-flight clicks.
 *
 * Renamed from `useBinderPull` (`usePullMutation` / `useUnpullMutation`)
 * 2026-05-13 per the §1.1.1 additive-deprecation runway.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { watchCard, unwatchCard, type WatchCardRequest } from "@/lib/api/watching-endpoints";
import { WATCHING_QUERY_KEY_ROOT } from "@/hooks/useWatching";
import type {
  BccApiError,
  WatchingFollowSource,
  WatchCardResponse,
  UnwatchCardResponse,
} from "@/lib/api/types";

export function useWatchMutation() {
  const queryClient = useQueryClient();
  return useMutation<WatchCardResponse, BccApiError, WatchCardRequest>({
    mutationFn: (request) => watchCard(request),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WATCHING_QUERY_KEY_ROOT });
    },
  });
}

/**
 * Unwatch mutation — input is `{ follow_id, source }`. `source` echoes
 * the WatchingItem.follow_source the row carried. Required for `page`-
 * source rows (the bcc_page_follows table) because follow_id auto-
 * increment ranges overlap with PeepSo's; defaults to 'peepso' so
 * callers that pre-date the V1.6 dual-source split keep working.
 */
export interface UnwatchCardInput {
  follow_id: number;
  source?: WatchingFollowSource;
}

export function useUnwatchMutation() {
  const queryClient = useQueryClient();
  return useMutation<UnwatchCardResponse, BccApiError, UnwatchCardInput>({
    mutationFn: ({ follow_id, source }) => unwatchCard(follow_id, source ?? "peepso"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WATCHING_QUERY_KEY_ROOT });
    },
  });
}
