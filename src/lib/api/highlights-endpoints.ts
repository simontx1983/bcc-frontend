/**
 * Typed wrappers for /me/highlights/* endpoints (§O2 / §O2.1).
 *
 * The strip is per-viewer + auth-required; both helpers go through
 * `bccFetchAsClient` so the active NextAuth session attaches its
 * Bearer token automatically. Anonymous callers should not invoke
 * these — the strip is hidden client-side for unauth viewers.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  DismissHighlightResponse,
  HighlightsResponse,
} from "@/lib/api/types";

/**
 * GET /me/highlights — strip read.
 * Returns 0–3 items in §O2.1 priority order (slot 1 → slot 3).
 */
export function getHighlights(signal?: AbortSignal): Promise<HighlightsResponse> {
  return bccFetchAsClient<HighlightsResponse>("me/highlights", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /me/highlights/:id/dismiss — single-item dismissal.
 * Idempotent — re-dismissing extends the per-slot TTL.
 */
export function dismissHighlight(id: string): Promise<DismissHighlightResponse> {
  return bccFetchAsClient<DismissHighlightResponse>(
    `me/highlights/${encodeURIComponent(id)}/dismiss`,
    { method: "POST" }
  );
}
