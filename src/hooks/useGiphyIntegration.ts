"use client";

/**
 * useGiphyIntegration — fetches the Giphy integration config from
 * GET /bcc/v1/integrations/giphy. Cached aggressively in React Query
 * because admin config doesn't change mid-session.
 *
 * Drives the composer's GIF button visibility — the button mounts
 * only when `data?.enabled === true`. When the integration is
 * disabled (admin off, no API key, or PeepSo not installed) the
 * button is hidden entirely; users never see a broken GIF picker.
 *
 * Anonymous viewers MUST NOT see the button anyway (composer is
 * auth-gated upstream), but the endpoint is also auth-gated so
 * unauthenticated `useQuery` calls would throw — `enabled: false`
 * gates the fetch on the consumer's authed state.
 */

import { useQuery } from "@tanstack/react-query";

import { getGiphyIntegration } from "@/lib/api/integrations-endpoints";
import type { BccApiError, GiphyIntegrationConfig } from "@/lib/api/types";

export const GIPHY_INTEGRATION_QUERY_KEY = ["integrations", "giphy"] as const;

export function useGiphyIntegration(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  return useQuery<GiphyIntegrationConfig, BccApiError>({
    queryKey: GIPHY_INTEGRATION_QUERY_KEY,
    queryFn:  () => getGiphyIntegration(),
    enabled,
    // Config is admin-set and stable across the session; refetch on
    // an arbitrarily long stale window. The server's max-age=300
    // upper-bounds the staleness even if a user keeps a tab open
    // forever.
    staleTime: 5 * 60 * 1000, // 5 min — matches server Cache-Control
    gcTime:    30 * 60 * 1000,
    retry:     1,
  });
}
