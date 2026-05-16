/**
 * Typed wrappers for /me/watching/* endpoints.
 *
 * The watchlist is the §C2 projection of PeepSo follows + the BCC
 * `bcc_pull_meta` sidecar (the storage table retains its legacy
 * physical name — see api-contract-v1.md §4.5.1). The WP backend is
 * the single source of truth. These wrappers just lock the URL,
 * HTTP method, and shape.
 *
 * Auth required for all four operations; bccFetchAsClient attaches
 * the Bearer JWT from the active NextAuth session.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CardKind,
  WatchCardResponse,
  UnwatchCardResponse,
  WatchingResponse,
  WatchingSummaryResponse,
} from "@/lib/api/types";

export interface WatchCardRequest {
  target_kind: CardKind;
  target_id: number;
}

export interface WatchingQueryParams {
  /** 1-based page index. Defaults server-side to 1. */
  page?: number;
  /** Items per page. Server caps at 50; default 20. */
  page_size?: number;
}

/**
 * GET /me/watching — paginated read of the viewer's watchlist. The
 * §C2 contract uses offset pagination here (vs. cursor pagination on
 * the feed) — it's a directory the user navigates by jumping pages,
 * not an unbounded stream.
 */
export function getWatching(
  params: WatchingQueryParams = {},
  signal?: AbortSignal
): Promise<WatchingResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    search.set("page_size", String(params.page_size));
  }
  const qs = search.toString();
  const path = qs === "" ? "me/watching" : `me/watching?${qs}`;
  return bccFetchAsClient<WatchingResponse>(path, { method: "GET", signal });
}

/**
 * GET /me/watching/summary — §N9 identity-snapshot. Pre-computed
 * server-side; the frontend renders without deriving counts or
 * percentages (per §A2). Refetches alongside the watchlist list so a
 * fresh watch updates the tier distribution + total without a manual
 * page reload.
 */
export function getWatchingSummary(
  signal?: AbortSignal
): Promise<WatchingSummaryResponse> {
  return bccFetchAsClient<WatchingSummaryResponse>("me/watching/summary", {
    method: "GET",
    signal,
  });
}

/**
 * POST /me/watching/watch — create the follow + watch-meta row. Server
 * returns the resulting watchlist item (or `status: 'already_watching'`
 * when the follow already existed). The `item.follow_id` is the
 * handle the UI threads back into the unwatch DELETE URL.
 */
export function watchCard(request: WatchCardRequest): Promise<WatchCardResponse> {
  return bccFetchAsClient<WatchCardResponse>("me/watching/watch", {
    method: "POST",
    body: request,
  });
}

/**
 * DELETE /me/watching/{follow_id} — unfollow + clear watch-meta. The
 * `follow_id` is the PeepSo follow id (or page-follow id) surfaced by
 * an earlier watch response or by /me/watching. The `source` discriminator
 * tells the server which table to delete from — required when the
 * WatchingItem.follow_source field was 'page'. Defaults to 'peepso' to
 * match pre-V1.6 callers that don't know about the source split.
 */
export function unwatchCard(
  followId: number,
  source: "peepso" | "page" = "peepso"
): Promise<UnwatchCardResponse> {
  const qs = source === "page" ? "?source=page" : "";
  return bccFetchAsClient<UnwatchCardResponse>(`me/watching/${followId}${qs}`, {
    method: "DELETE",
  });
}
