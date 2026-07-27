/**
 * Typed wrapper for /halls (per §E3 + §4.7 of the contract).
 *
 * Server-safe (uses `bccFetch` directly) so the /halls server
 * component can fetch during SSR. Anonymous reads are explicitly
 * supported by the backend — pass `null` for the token when no
 * session is present and the response's `viewer_membership` blocks
 * come back null.
 *
 * Mutations (join / leave / set-primary) go through `bccFetchAsClient`
 * from interactive client components, not through the server-safe path.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  ClearPrimaryHallResponse,
  JoinHallResponse,
  LeaveHallResponse,
  HallDetailResponse,
  HallsResponse,
  SetPrimaryHallResponse,
} from "@/lib/api/types";

export interface HallsQueryParams {
  /** 1-based page index. Defaults server-side to 1. */
  page?: number;
  /** Items per page. Server caps at 50; default 20. */
  page_size?: number;
  /** Optional chain filter (e.g. "cosmos"). Matched on name keyword. */
  chain?: string;
}

export function getHalls(
  params: HallsQueryParams = {},
  token: string | null,
  signal?: AbortSignal
): Promise<HallsResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    search.set("page_size", String(params.page_size));
  }
  if (params.chain !== undefined && params.chain !== "") {
    search.set("chain", params.chain);
  }
  const qs = search.toString();
  const path = qs === "" ? "halls" : `halls?${qs}`;

  return bccFetch<HallsResponse>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * GET /halls/:slug — single Hall detail. Server-safe (uses bccFetch
 * directly) so the /halls/[slug] server component can fetch during
 * SSR. 404 surfaces as a typed BccApiError with status 404 — callers
 * map to Next's `notFound()`.
 */
export function getHall(
  slug: string,
  token: string | null,
  signal?: AbortSignal
): Promise<HallDetailResponse> {
  return bccFetch<HallDetailResponse>(`halls/${encodeURIComponent(slug)}`, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /me/halls/:id/primary — mark a group as the viewer's primary
 * Hall. Server gates on actual membership (403 `bcc_forbidden`
 * otherwise — UI should disable the toggle in that branch per §N7).
 */
export function setPrimaryHall(groupId: number): Promise<SetPrimaryHallResponse> {
  return bccFetchAsClient<SetPrimaryHallResponse>(
    `me/halls/${groupId}/primary`,
    { method: "POST" }
  );
}

/**
 * DELETE /me/halls/primary — clear the primary-Hall pointer.
 * Idempotent; succeeds even when nothing was set.
 */
export function clearPrimaryHall(): Promise<ClearPrimaryHallResponse> {
  return bccFetchAsClient<ClearPrimaryHallResponse>("me/halls/primary", {
    method: "DELETE",
  });
}

/**
 * POST /me/halls/:id/membership — join the Hall via PeepSo's
 * canonical group write API (§C2 single-graph rule). Idempotent —
 * re-joining as an active member returns success with the existing
 * viewer_membership block.
 *
 * Errors:
 *   - bcc_unauthorized — no session
 *   - bcc_not_found    — group id doesn't match a BCC Hall
 *   - bcc_forbidden    — Hall doesn't accept open membership (closed
 *                        groups; deferred from V1)
 *   - bcc_unavailable  — PeepSo deactivated server-side
 */
export function joinHall(groupId: number): Promise<JoinHallResponse> {
  return bccFetchAsClient<JoinHallResponse>(
    `me/halls/${groupId}/membership`,
    { method: "POST" }
  );
}

/**
 * DELETE /me/halls/:id/membership — leave the Hall. If the user is
 * leaving their primary Hall the server atomically clears the
 * `bcc_primary_hall_group_id` pointer (`primary_cleared: true` in
 * the response). Idempotent — leaving as a non-member is a successful
 * no-op.
 *
 * Errors mirror joinHall.
 */
export function leaveHall(groupId: number): Promise<LeaveHallResponse> {
  return bccFetchAsClient<LeaveHallResponse>(
    `me/halls/${groupId}/membership`,
    { method: "DELETE" }
  );
}
