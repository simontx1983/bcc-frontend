/**
 * Typed wrappers for /me/celebrations/* endpoints (§O1.2).
 *
 * Heavy-intensity moments — rank-up, level-up, tier-upgrade — fire
 * out-of-band from the originating action because their subscribers
 * run async per §A3. The frontend polls /me/celebrations/pending,
 * renders the toast when it lands, and POSTs /consume to clear the
 * single-slot stash.
 *
 * Both endpoints are auth-required — anonymous viewers never have
 * pending celebrations. Use bccFetchAsClient so the active NextAuth
 * session attaches its Bearer token automatically.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  ConsumeCelebrationResponse,
  PendingCelebrationResponse,
} from "@/lib/api/types";

/**
 * GET /me/celebrations/pending — read the stashed celebration without
 * clearing it. Returns `{ celebration: null }` when nothing is pending.
 *
 * The two-step read+consume split keeps render-then-consume safe: if
 * the toast animation crashes mid-flight, the celebration survives to
 * the next mount instead of being silently eaten.
 */
export function getPendingCelebration(
  signal?: AbortSignal
): Promise<PendingCelebrationResponse> {
  return bccFetchAsClient<PendingCelebrationResponse>("me/celebrations/pending", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /me/celebrations/consume — clear the stash. Idempotent;
 * consuming when nothing is pending is a no-op success.
 */
export function consumeCelebration(): Promise<ConsumeCelebrationResponse> {
  return bccFetchAsClient<ConsumeCelebrationResponse>("me/celebrations/consume", {
    method: "POST",
  });
}
