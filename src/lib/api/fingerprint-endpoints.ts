/**
 * §V1.5 — POST /bcc-trust/v1/device-fingerprint.
 *
 * Fire-and-forget. The hook caller swallows errors silently — fingerprint
 * reporting is a fraud signal, never a UX gate. The server returns
 * `{stored: true}` on success but we don't surface it (per the
 * controller's "never expose internal fraud detection signals" rule).
 */

import { bccTrustFetch } from "@/lib/api/bcc-trust-client";
import type { FingerprintPayload } from "@/lib/fingerprint/collect";

interface StoreFingerprintResponse {
  stored: boolean;
}

export function postFingerprint(
  payload: FingerprintPayload,
): Promise<StoreFingerprintResponse> {
  return bccTrustFetch<StoreFingerprintResponse>("/device-fingerprint", {
    method: "POST",
    body: payload,
  });
}
