/**
 * Typed wrapper for GET /bcc/v1/ranks (§4.8 — Rank redesign Phase 5).
 *
 * The server catalog is the ONLY rung source (plan invariant 33): the
 * frontend renders `label`/`description` verbatim and derives no
 * thresholds, labels, or ladder ordering. The old client-side rung-list
 * constant (under lib/identity/) this replaces is deleted.
 *
 * Auth-permissive — anonymous viewers get the static catalog with an
 * all-null viewer block; authed viewers additionally get their own
 * member-state block. `bccFetchAsClient` forwards the bearer when a
 * session is active, so both cases flow through one call.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  FindingAppealResponse,
  RankCatalogResponse,
} from "@/lib/api/types";

export function getRankCatalog(
  signal?: AbortSignal,
): Promise<RankCatalogResponse> {
  return bccFetchAsClient<RankCatalogResponse>("ranks", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /me/findings/:id/appeal — the once-only §15.5 appeal request on
 * an own-view misconduct finding (Rank Phase 8).
 *
 * Errors (typed BccApiError, branch on `code`):
 *   - bcc_unauthorized — no session
 *   - bcc_not_found    — not the caller's finding (or unknown id — the
 *                        server 404s both identically, no existence leak)
 *   - bcc_conflict     — appeal already requested or already decided
 *   - bcc_rate_limited — request throttle
 */
export function requestFindingAppeal(
  findingId: number,
): Promise<FindingAppealResponse> {
  return bccFetchAsClient<FindingAppealResponse>(
    `me/findings/${findingId}/appeal`,
    { method: "POST" },
  );
}
