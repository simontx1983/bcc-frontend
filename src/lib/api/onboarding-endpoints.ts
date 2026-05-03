/**
 * Typed wrappers for /onboarding/* and /me/onboarding/* endpoints.
 *
 * Each function is a one-liner around bccFetchAsClient (browser) or
 * bccFetch (server) — its job is to lock the URL, the HTTP method,
 * and the response type at the call site so React Query hooks
 * consuming them stay free of magic strings.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  HandleUpdateResponse,
  OnboardingCompleteRequest,
  OnboardingCompleteResponse,
  OnboardingStatus,
  OnboardingSuggestions,
} from "@/lib/api/types";

/**
 * GET /onboarding/suggestions
 * Returns 4 admin-curated cards per bucket (validators / projects /
 * creators), top-ranked by trust. Auth required — bccFetchAsClient
 * attaches the BCC bearer JWT from the active NextAuth session.
 */
export function getOnboardingSuggestions(signal?: AbortSignal): Promise<OnboardingSuggestions> {
  return bccFetchAsClient<OnboardingSuggestions>("onboarding/suggestions", {
    method: "GET",
    signal,
  });
}

/**
 * POST /me/onboarding/complete
 * Idempotent — server flips bcc_onboarding_completed to '1' and
 * fires `bcc_onboarding_completed` action. The optional `home_chain`
 * field carries §B4 wizard step 1's pick; omit when the user skipped.
 * Last-write-wins on subsequent calls (rare, but harmless).
 */
export function completeOnboarding(
  body: OnboardingCompleteRequest = {},
  signal?: AbortSignal
): Promise<OnboardingCompleteResponse> {
  return bccFetchAsClient<OnboardingCompleteResponse>("me/onboarding/complete", {
    method: "POST",
    body,
    signal,
  });
}

/**
 * PATCH /me/handle — change the viewer's bcc_handle.
 *
 * Server enforces the §B6 rules (uniqueness, character set, reserved
 * list) and the 7-day cooldown. Errors come back as typed
 * BccApiError codes:
 *
 *   - bcc_unauthorized     → no session
 *   - bcc_invalid_handle   → fails the §B6 character/length rules
 *   - bcc_handle_reserved  → on the reserved list
 *   - bcc_conflict         → already taken (case-insensitive)
 *   - bcc_rate_limited     → cooldown active; Retry-After header set
 *
 * On success: server returns the new handle + ISO 8601 next_change_at
 * (or null when the rename was a no-op against the current value).
 */
export function updateHandle(handle: string): Promise<HandleUpdateResponse> {
  return bccFetchAsClient<HandleUpdateResponse>("me/handle", {
    method: "PATCH",
    body: { handle },
  });
}

/**
 * GET /me/onboarding/status — server-side variant.
 *
 * Used by the /onboarding gate (a server component) which can't use
 * the client-only `bccFetchAsClient` (it'd throw the typeof-window
 * guard). The caller passes the BCC bearer token from
 * `getServerSession(authOptions).bccToken` directly through.
 *
 * Always-fresh by design: the gate's correctness depends on the
 * current server-side flag, not a cached JWT claim that may be stale
 * across tabs/browsers.
 */
export function getOnboardingStatusServerSide(
  bccToken: string,
  signal?: AbortSignal
): Promise<OnboardingStatus> {
  return bccFetch<OnboardingStatus>("me/onboarding/status", {
    method: "GET",
    token: bccToken,
    signal,
  });
}
