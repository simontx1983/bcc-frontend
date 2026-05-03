/**
 * Typed wrappers for /me/binder/* endpoints.
 *
 * The binder is the §C2 projection of PeepSo follows + the BCC
 * `bcc_pull_meta` sidecar — the WP backend is the single source of
 * truth. These wrappers just lock the URL, HTTP method, and shape.
 *
 * Auth required for all three operations; bccFetchAsClient attaches
 * the Bearer JWT from the active NextAuth session.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  BinderResponse,
  BinderSummaryResponse,
  CardKind,
  PullCardResponse,
  UnpullCardResponse,
} from "@/lib/api/types";

export interface PullCardRequest {
  target_kind: CardKind;
  target_id: number;
}

export interface BinderQueryParams {
  /** 1-based page index. Defaults server-side to 1. */
  page?: number;
  /** Items per page. Server caps at 50; default 20. */
  page_size?: number;
}

/**
 * GET /me/binder — paginated read of the viewer's binder. The §C2
 * contract uses offset pagination here (vs. cursor pagination on
 * the feed) — it's a directory the user navigates by jumping pages,
 * not an unbounded stream.
 */
export function getBinder(
  params: BinderQueryParams = {},
  signal?: AbortSignal
): Promise<BinderResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    search.set("page_size", String(params.page_size));
  }
  const qs = search.toString();
  const path = qs === "" ? "me/binder" : `me/binder?${qs}`;
  return bccFetchAsClient<BinderResponse>(path, { method: "GET", signal });
}

/**
 * GET /me/binder/summary — §N9 identity-snapshot. Pre-computed
 * server-side; the frontend renders without deriving counts or
 * percentages (per §A2). Refetches alongside the binder list so a
 * fresh pull updates the tier distribution + total without a manual
 * page reload.
 */
export function getBinderSummary(
  signal?: AbortSignal
): Promise<BinderSummaryResponse> {
  return bccFetchAsClient<BinderSummaryResponse>("me/binder/summary", {
    method: "GET",
    signal,
  });
}

/**
 * POST /me/binder/pull — create the follow + pull_meta row. Server
 * returns the resulting binder item (or `status: 'already_pulled'`
 * when the follow already existed). The `item.follow_id` is the
 * handle the UI threads back into the unpull DELETE URL.
 */
export function pullCard(request: PullCardRequest): Promise<PullCardResponse> {
  return bccFetchAsClient<PullCardResponse>("me/binder/pull", {
    method: "POST",
    body: request,
  });
}

/**
 * DELETE /me/binder/{follow_id} — unfollow + clear pull_meta. The
 * `follow_id` is the PeepSo follow id surfaced by an earlier pull
 * response or by /me/binder.
 */
export function unpullCard(followId: number): Promise<UnpullCardResponse> {
  return bccFetchAsClient<UnpullCardResponse>(`me/binder/${followId}`, {
    method: "DELETE",
  });
}
