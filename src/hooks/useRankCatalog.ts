"use client";

/**
 * useRankCatalog — cached read of GET /bcc/v1/ranks (§4.8).
 *
 * Backs RankInfoModal's ladder section. The catalog is near-static
 * (three rungs; the server itself caches responses for 60–300s), so a
 * generous staleTime keeps repeat modal opens instant with no refetch.
 *
 * The response also carries a `viewer` member-state block. It is
 * personal for signed-in viewers but keyed globally here — acceptable
 * because the cache lives per-browser-session and current consumers
 * read only the shared `ranks` catalog. If a surface starts rendering
 * `viewer`, revisit the key (or invalidate on auth transitions).
 *
 * Old-backend tolerance: the pre-Phase-5 endpoint ships the same
 * catalog shape (key/label/description/auto_assigned/order) with a
 * different viewer block — catalog consumers degrade cleanly.
 */

import { useQuery } from "@tanstack/react-query";

import { getRankCatalog } from "@/lib/api/ranks-endpoints";
import type { RankCatalogResponse } from "@/lib/api/types";

export const RANK_CATALOG_QUERY_KEY = ["ranks", "catalog"] as const;

export function useRankCatalog(opts?: { enabled?: boolean }) {
  return useQuery<RankCatalogResponse>({
    queryKey: RANK_CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => getRankCatalog(signal),
    enabled: opts?.enabled ?? true,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
