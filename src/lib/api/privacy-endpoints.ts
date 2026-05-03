/**
 * Typed wrappers for /me/privacy endpoints (§K2).
 *
 * GET returns all 8 flags; PATCH accepts a partial bag and returns the
 * post-write state so the client can re-seed React Query without a
 * second round-trip.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { MyPrivacyPatch, MyPrivacySettings } from "@/lib/api/types";

/**
 * GET /me/privacy — read all 8 §K2 + discovery flags for the
 * signed-in user. Auth required.
 */
export function getMyPrivacy(signal?: AbortSignal): Promise<MyPrivacySettings> {
  return bccFetchAsClient<MyPrivacySettings>("me/privacy", {
    method: "GET",
    signal,
  });
}

/**
 * PATCH /me/privacy — partial update. Only listed keys change;
 * omitted keys retain their previous value. Server responds with
 * the full post-write state.
 */
export function updateMyPrivacy(
  patch: MyPrivacyPatch
): Promise<MyPrivacySettings> {
  return bccFetchAsClient<MyPrivacySettings>("me/privacy", {
    method: "PATCH",
    body: patch,
  });
}
