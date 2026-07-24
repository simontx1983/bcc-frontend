"use client";

/**
 * useCardEntity — client-side read of the §L5 card view-model
 * (GET /cards/:type/:id).
 *
 * The entity ROUTES (/v, /p, /c, /u) fetch this server-side during SSR
 * via `getCardEntity`. This hook is for the surfaces that need the same
 * view-model from the browser, where there's no `getServerSession()` to
 * pull a token from — today: /messages/new resolving the validator it
 * was deep-linked to.
 *
 * Query key: `["card", kind, idOrSlug]`. That deliberately nests under
 * the pre-existing `["card"]` root that useEndorse / usePageAvatar /
 * useAttestations already invalidate after a mutation, so an endorse or
 * avatar change refreshes this read for free — no new invalidation
 * wiring.
 *
 * staleTime is 60s: card view-models are recomputed on the server's
 * trust/score cadence (minutes, not seconds), and every path that can
 * change one from THIS client already invalidates the `["card"]` root
 * explicitly. A short stale window would just re-fetch an unchanged
 * payload.
 */

import { useQuery } from "@tanstack/react-query";

import { getCardEntityAsClient } from "@/lib/api/card-endpoints";
import type { BccApiError, Card, CardKind } from "@/lib/api/types";

export const CARD_ENTITY_QUERY_KEY_ROOT = ["card"] as const;

const DEFAULT_STALE_TIME_MS = 60_000;

export interface UseCardEntityOptions {
  enabled?: boolean;
}

/**
 * @param kind     Card kind, or null when the caller hasn't resolved one
 *                 yet (query stays idle).
 * @param idOrSlug Numeric post id or slug/handle, or null when unknown.
 */
export function useCardEntity(
  kind: CardKind | null,
  idOrSlug: string | null,
  options: UseCardEntityOptions = {},
) {
  const callerEnabled = options.enabled ?? true;
  const enabled =
    callerEnabled && kind !== null && idOrSlug !== null && idOrSlug !== "";

  return useQuery<Card, BccApiError>({
    queryKey: [...CARD_ENTITY_QUERY_KEY_ROOT, kind ?? "", idOrSlug ?? ""],
    queryFn: ({ signal }) => {
      // `enabled` guards both against null; React Query won't fire
      // the queryFn otherwise (same narrowing idiom as useConversation).
      return getCardEntityAsClient(kind as CardKind, idOrSlug as string, {
        signal,
      });
    },
    enabled,
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}
