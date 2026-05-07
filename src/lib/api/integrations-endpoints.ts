/**
 * Typed wrapper for /integrations/* — surfaces PeepSo admin-configured
 * integration toggles + keys to the BCC frontend (api-contract-v1.md
 * §4.16).
 *
 * V1: only Giphy. Future surfaces (Tenor, custom emoji, stickers) live
 * behind the same namespace with the same `{enabled, ...config}`
 * pattern.
 *
 * The server caches `Cache-Control: private, max-age=300`; the
 * `useGiphyIntegration` hook layers React Query stale-time on top so
 * the picker doesn't refetch on every mount.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { GiphyIntegrationConfig } from "@/lib/api/types";

/** GET /bcc/v1/integrations/giphy. Auth-required. */
export function getGiphyIntegration(): Promise<GiphyIntegrationConfig> {
  return bccFetchAsClient<GiphyIntegrationConfig>("integrations/giphy", {
    method: "GET",
  });
}
