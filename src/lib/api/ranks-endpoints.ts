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
import type { RankCatalogResponse } from "@/lib/api/types";

export function getRankCatalog(
  signal?: AbortSignal,
): Promise<RankCatalogResponse> {
  return bccFetchAsClient<RankCatalogResponse>("ranks", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
