/**
 * Typed wrapper for /groups (§4.7.4 — cross-kind discovery).
 *
 * Server-safe (uses `bccFetch` directly) so the /communities server
 * component can fetch during SSR. Anonymous reads are explicitly
 * supported by the backend — pass `null` for the token when no
 * session is present.
 *
 * Pagination is offset-based (page / page_size). The candidate pool
 * is server-capped at 500 before sort+pagination — deep pagination
 * beyond that has imperfect cross-page sort. v1 scale is well under
 * this; if/when total exceeds 500 the backend swaps to SQL-side sort
 * and the client doesn't change.
 */

import { bccFetch } from "@/lib/api/client";
import type { GroupsDiscoveryResponse } from "@/lib/api/types";

export interface GroupsDiscoveryQueryParams {
  /** When true, restricts to on-chain verified (NFT-gated) groups. */
  verified?: boolean;
  /** 1-based page index. Defaults server-side to 1. */
  page?: number;
  /** Items per page. Server caps at 50; default 20. */
  page_size?: number;
}

export function getGroupsDiscovery(
  params: GroupsDiscoveryQueryParams = {},
  token: string | null,
  signal?: AbortSignal
): Promise<GroupsDiscoveryResponse> {
  const search = new URLSearchParams();
  if (params.verified === true) {
    search.set("verified", "1");
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.page_size !== undefined) {
    search.set("page_size", String(params.page_size));
  }
  const qs = search.toString();
  const path = qs === "" ? "groups" : `groups?${qs}`;

  return bccFetch<GroupsDiscoveryResponse>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
