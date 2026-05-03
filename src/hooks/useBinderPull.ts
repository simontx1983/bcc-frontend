"use client";

/**
 * Binder pull / unpull mutation hooks.
 *
 * Two raw mutations — one per HTTP verb. Composition (toggling, error
 * presentation, per-card pending state) lives in the consumer.
 * Keeping these mutations granular means future surfaces (the binder
 * page, the Floor feed's inline pull control, the card-detail page)
 * can compose differently without subclassing or option-juggling.
 *
 * Cache invalidation: both mutations invalidate the entire `binder`
 * query namespace on settle (success OR error — invalidating on error
 * recovers from races where a 429 fires AFTER the row was written).
 * Any active `useBinder()` consumer refetches automatically.
 *
 * No in-mutation optimistic update — the consumer applies its own
 * optimistic state because the FOLLOW_ID it needs back for unpull only
 * exists after the server responds. The wizard's `useWizardPulls`
 * derives "pulled" state from the binder query and overlays a
 * pending-flip for in-flight clicks.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { pullCard, unpullCard, type PullCardRequest } from "@/lib/api/binder-endpoints";
import { BINDER_QUERY_KEY_ROOT } from "@/hooks/useBinder";
import type { BccApiError, PullCardResponse, UnpullCardResponse } from "@/lib/api/types";

export function usePullMutation() {
  const queryClient = useQueryClient();
  return useMutation<PullCardResponse, BccApiError, PullCardRequest>({
    mutationFn: (request) => pullCard(request),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BINDER_QUERY_KEY_ROOT });
    },
  });
}

export function useUnpullMutation() {
  const queryClient = useQueryClient();
  return useMutation<UnpullCardResponse, BccApiError, number>({
    mutationFn: (followId) => unpullCard(followId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BINDER_QUERY_KEY_ROOT });
    },
  });
}