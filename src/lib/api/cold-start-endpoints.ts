/**
 * Typed wrapper for /feed/cold-start (§F5 / Sprint 3).
 *
 * The cold-start endpoint is the bridge surface for the home-feed
 * empty state. The `cold-start` label encodes the posture: this
 * surface exists for the moment before personalization, not as an
 * algorithmic destination. (Historical note: /discover was the legacy
 * bcc-page-slider endpoint, retired 2026-05-15 — see Plugin.php
 * tombstone.)
 *
 * Auth-permissive — anon viewers get the same envelope shape with
 * no chain-alignment personalization. Use `bccFetch` (forwarded
 * bearer when available) rather than `bccFetchAsClient` so server
 * components on the Floor home page can SSR the cold-start payload
 * if/when that wiring lands.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { ColdStartResponse } from "@/lib/api/types";

export function getColdStart(signal?: AbortSignal): Promise<ColdStartResponse> {
  return bccFetchAsClient<ColdStartResponse>("feed/cold-start", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
