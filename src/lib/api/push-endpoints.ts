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

import { bccFetchAsClient } from "@/lib/api/client";

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

export function revokePushSubscription(
  id: number,
): Promise<{ ok: true }> {
  return bccFetchAsClient<{ ok: true }>(
    `me/push-subscriptions/${id}`,
    { method: "DELETE" },
  );
}
