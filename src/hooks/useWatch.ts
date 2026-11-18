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

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { humanizeCode } from "@/lib/api/errors";
import { watchCard, unwatchCard, type WatchCardRequest } from "@/lib/api/watching-endpoints";
import { WATCHING_QUERY_KEY_ROOT } from "@/hooks/useWatching";
import { FOLLOW_COPY } from "@/lib/copy";
import type {
  BccApiError,
  CardKind,
  ViewerWatch,
  WatchingFollowSource,
  WatchCardResponse,
  UnwatchCardResponse,
} from "@/lib/api/types";

/**
 * Inline copy for a failed watch or unwatch, keyed on `err.code` and never
 * on `err.message` (§γ). One helper so every watch surface says the same
 * thing.
 *
 * F-236: `POST /me/watching/watch` refuses with 403 `bcc_forbidden` when a
 * block exists either way, or the viewer is suspended (contract v1.124).
 * The line is generic and reveals no block. A mutation does not retry
 * (the QueryClient sets retry only for queries), and the mutation's
 * onSettled already refetches the watching list, which drops a member
 * the block removed.
 */
export function watchErrorCopy(err: unknown, verb: "watch" | "unwatch"): string {
  return humanizeCode(
    err,
    {
      ...(verb === "watch" ? { bcc_forbidden: FOLLOW_COPY.refused } : {}),
      bcc_rate_limited: "Too fast — wait a moment and try again.",
    },
    FOLLOW_COPY.failed,
  );
}

/**
 * Write a toggle's outcome into every cached copy of that card / profile
 * (F-255). Applied by the two mutations below on success.
 *
 * Without this, a remount (re-hovering the author card inside the profile's
 * 30s cache, Back to a grid, the profile hero) read the OLD server answer —
 * and after an unwatch it said "Watching" with a deleted follow_id, so the
 * next click failed. Matches page/member cards by (card_kind, id) and, for
 * a member, the profile object (`user_id` + `viewer_is_watching`). Copies
 * only along changed paths, so untouched queries keep their identity.
 */
export function patchViewerWatchInCache(
  queryClient: QueryClient,
  kind: CardKind,
  id: number,
  watch: ViewerWatch | null,
): void {
  const matches = (o: Record<string, unknown>): boolean => {
    if (!("viewer_is_watching" in o) || o["id"] !== id) return false;
    if (o["card_kind"] === kind) return true;
    return kind === "member" && o["card_kind"] === undefined && "user_id" in o;
  };
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 8 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = walk(x, depth + 1);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    const o = v as Record<string, unknown>;
    if (matches(o)) {
      return { ...o, viewer_is_watching: watch !== null, viewer_watch: watch };
    }
    let next: Record<string, unknown> | null = null;
    for (const [k, x] of Object.entries(o)) {
      const y = walk(x, depth + 1);
      if (y !== x) {
        next ??= { ...o };
        next[k] = y;
      }
    }
    return next ?? o;
  };
  for (const query of queryClient.getQueryCache().getAll()) {
    const data = query.state.data;
    if (data === undefined) continue;
    const patched = walk(data, 0);
    if (patched !== data) queryClient.setQueryData(query.queryKey, patched);
  }
}

export function useWatchMutation() {
  const queryClient = useQueryClient();
  return useMutation<WatchCardResponse, BccApiError, WatchCardRequest>({
    mutationFn: (request) => watchCard(request),
    onSuccess: (res, request) => {
      patchViewerWatchInCache(queryClient, request.target_kind, request.target_id, {
        follow_id: res.item.follow_id,
        source: res.item.follow_source ?? "peepso",
      });
    },
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
  /** The card / member unwatched, so its cached copies can be updated (F-255). */
  target?: { card_kind: CardKind; id: number };
}

export function useUnwatchMutation() {
  const queryClient = useQueryClient();
  return useMutation<UnwatchCardResponse, BccApiError, UnwatchCardInput>({
    mutationFn: ({ follow_id, source }) => unwatchCard(follow_id, source ?? "peepso"),
    onSuccess: (_res, input) => {
      if (input.target !== undefined) {
        patchViewerWatchInCache(queryClient, input.target.card_kind, input.target.id, null);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: WATCHING_QUERY_KEY_ROOT });
    },
  });
}
