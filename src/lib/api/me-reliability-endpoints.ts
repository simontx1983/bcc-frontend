/**
 * Typed wrapper for GET /bcc/v1/me/reliability (§4.20 §J.5).
 *
 * Self-only surface — every successful response is for the requesting
 * operator. The endpoint is the canonical home of the numeric
 * `operator_reliability` + the trend block per the §J.3.2 asymmetric-
 * display rule; those fields are NEVER returned by any third-party
 * endpoint.
 *
 * Error codes the FE branches on (per the §γ error-contract rule —
 * NEVER branch on err.message):
 *   - bcc_unauthorized   (401) — not signed in
 *   - bcc_internal_error (500) — service unavailable
 *
 * Server cache: `private, max-age=60`. Fresh casts surface within a
 * minute on the next read; Slice E adds generation-counter
 * invalidation for the real synthesis.
 */

import { bccFetch } from "@/lib/api/client";
import type { MeReliabilityResponse } from "@/lib/api/types";

/**
 * Fetch the signed-in operator's reliability self-mirror.
 *
 * Server-component callers pass `token` (the NextAuth session bearer);
 * the server-safe `bccFetch` (not `bccFetchAsClient`) is the right
 * primitive for server-side rendering. Client components that consume
 * this must rely on the server-rendered page; we deliberately do NOT
 * ship a React Query hook in PR-2 because the page is a server
 * component and re-fetching client-side would race the 60s server
 * cache with no UX benefit.
 */
export function getMeReliability(
  token: string | null,
  signal?: AbortSignal,
): Promise<MeReliabilityResponse> {
  return bccFetch<MeReliabilityResponse>("me/reliability", {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
