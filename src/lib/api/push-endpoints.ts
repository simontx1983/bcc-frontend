/**
 * §V2 Phase 1 — typed wrappers for /me/push-subscriptions.
 *
 * Backend: MyPushSubscriptionEndpoint @ /wp-json/bcc/v1. Standard BCC
 * envelope (`{data, _meta}`). Auth required — bearer JWT.
 *
 * Three operations:
 *   - getVapidPublicKey()      → public key for PushManager.subscribe()
 *   - registerPushSubscription → POST a fresh browser subscription
 *   - revokePushSubscription   → DELETE one device by id
 *
 * Master-toggle disable goes through the prefs PATCH cascade (see
 * notification-prefs-endpoints.ts), not a separate route here.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";

export interface VapidPublicKeyResponse {
  public_key: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string;
}

export interface RegisterPushSubscriptionResponse {
  id: number;
  master_enabled: boolean;
}

export function getVapidPublicKey(
  signal?: AbortSignal,
): Promise<VapidPublicKeyResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<VapidPublicKeyResponse>(
    "me/push-subscriptions/vapid-public-key",
    init,
  );
}

export function registerPushSubscription(
  payload: PushSubscriptionPayload,
): Promise<RegisterPushSubscriptionResponse> {
  return bccFetchAsClient<RegisterPushSubscriptionResponse>(
    "me/push-subscriptions",
    {
      method: "POST",
      body: payload,
    },
  );
}

/**
 * Delete one server-side push-subscription row.
 *
 * Takes an EXPLICIT token and goes through the low-level `bccFetch`
 * rather than `bccFetchAsClient`, because its only caller is the session
 * teardown: routing it through the session-aware client would let a 401
 * here re-enter the expiry handler and start a second teardown.
 *
 * The server is idempotent (a missing row is a 200) and ownership-checked
 * (someone else's row is a 403), so a rejection here is safe to swallow.
 */
export function deletePushSubscription(
  id: number,
  token: string,
): Promise<{ ok: true }> {
  return bccFetch<{ ok: true }>(`me/push-subscriptions/${id}`, {
    method: "DELETE",
    token,
  });
}
