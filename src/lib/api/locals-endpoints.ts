/**
 * Typed wrapper for /locals (per §E3 + §4.7 of the contract).
 *
 * Server-safe (uses `bccFetch` directly) so the /locals server
 * component can fetch during SSR. Anonymous reads are explicitly
 * supported by the backend — pass `null` for the token when no
 * session is present and the response's `viewer_membership` blocks
 * come back null.
 *
 * Mutations (join / leave / set-primary) are deferred — when they
 * land they'll go through `bccFetchAsClient` from interactive
 * client components, not through this module.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  ClearPrimaryLocalResponse,
  JoinLocalResponse,
  LeaveLocalResponse,
  LocalDetailResponse,
  LocalsResponse,
  SetPrimaryLocalResponse,
} from "@/lib/api/types";

export interface LocalsQueryParams {
  /** 1-based page index. Defaults server-side to 1. */
  page?: number;
  /** Items per page. Server caps at 50; default 20. */
  page_size?: number;
  /** Optional chain filter (e.g. "cosmos"). Matched on name keyword. */
  chain?: string;
}

export function getLocals(
  params: LocalsQueryParams = {},
  token: string | null,
  signal?: AbortSignal
): Promise<LocalsResponse> {
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
  const path = qs === "" ? "locals" : `locals?${qs}`;

  return bccFetch<LocalsResponse>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * GET /locals/:slug — single Local detail. Server-safe (uses bccFetch
 * directly) so the /locals/[slug] server component can fetch during
 * SSR. 404 surfaces as a typed BccApiError with status 404 — callers
 * map to Next's `notFound()`.
 */
export function getLocal(
  slug: string,
  token: string | null,
  signal?: AbortSignal
): Promise<LocalDetailResponse> {
  return bccFetch<LocalDetailResponse>(`locals/${encodeURIComponent(slug)}`, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /me/locals/:id/primary — mark a group as the viewer's primary
 * Local. Server gates on actual membership (403 `bcc_forbidden`
 * otherwise — UI should disable the toggle in that branch per §N7).
 */
export function setPrimaryLocal(groupId: number): Promise<SetPrimaryLocalResponse> {
  return bccFetchAsClient<SetPrimaryLocalResponse>(
    `me/locals/${groupId}/primary`,
    { method: "POST" }
  );
}

/**
 * DELETE /me/locals/primary — clear the primary-Local pointer.
 * Idempotent; succeeds even when nothing was set.
 */
export function clearPrimaryLocal(): Promise<ClearPrimaryLocalResponse> {
  return bccFetchAsClient<ClearPrimaryLocalResponse>("me/locals/primary", {
    method: "DELETE",
  });
}

/**
 * POST /me/locals/:id/membership — join the Local via PeepSo's
 * canonical group write API (§C2 single-graph rule). Idempotent —
 * re-joining as an active member returns success with the existing
 * viewer_membership block.
 *
 * Errors:
 *   - bcc_unauthorized — no session
 *   - bcc_not_found    — group id doesn't match a BCC Local
 *   - bcc_forbidden    — Local doesn't accept open membership (closed
 *                        groups; deferred from V1)
 *   - bcc_unavailable  — PeepSo deactivated server-side
 */
export function joinLocal(groupId: number): Promise<JoinLocalResponse> {
  return bccFetchAsClient<JoinLocalResponse>(
    `me/locals/${groupId}/membership`,
    { method: "POST" }
  );
}

/**
 * DELETE /me/locals/:id/membership — leave the Local. If the user is
 * leaving their primary Local the server atomically clears the
 * `bcc_primary_local_group_id` pointer (`primary_cleared: true` in
 * the response). Idempotent — leaving as a non-member is a successful
 * no-op.
 *
 * Errors mirror joinLocal.
 */
export function leaveLocal(groupId: number): Promise<LeaveLocalResponse> {
  return bccFetchAsClient<LeaveLocalResponse>(
    `me/locals/${groupId}/membership`,
    { method: "DELETE" }
  );
}
