/**
 * Typed wrappers for /bcc/v1/me/attestations (§4.20 §J — Slice C).
 *
 * Three mutation endpoints. All Bearer-authed (self-only), all
 * `Cache-Control: private, no-store`. Server returns the §1.4
 * envelope; bccFetchAsClient unwraps `data` and surfaces `error` as
 * a typed BccApiError.
 *
 * Error codes the FE branches on (per the §γ error-contract rule —
 * NEVER branch on err.message):
 *   - bcc_unauthorized                       (401)
 *   - bcc_invalid_request                    (400)
 *   - bcc_attestation_self                   (422)
 *   - bcc_attestation_ineligible             (403) — error.data.unlock_hint carries copy
 *   - bcc_attestation_bandwidth_exhausted    (409) — error.data.slot_holders[] (V1 empty)
 *   - bcc_attestation_fraud_blocked          (403)
 *   - bcc_rate_limited                       (429)
 *   - bcc_not_found                          (404)
 *   - bcc_forbidden                          (403)
 *   - bcc_attestation_revoked                (409) — reaffirm-on-revoked
 *   - bcc_internal_error                     (500)
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AttestationCastRequest,
  AttestationCastResponse,
  AttestationReaffirmResponse,
  AttestationRevokeResponse,
} from "@/lib/api/types";

/**
 * POST /me/attestations — cast a new attestation.
 *
 * Idempotent on (attestor, target_kind, target_id, kind):
 *   - HTTP 201 + status='created' on real insert
 *   - HTTP 200 + status='existing' on duplicate (same row returned)
 *
 * Failure cases the caller MUST distinguish:
 *   - bcc_attestation_ineligible: tier gate failed; render
 *     error.data.unlock_hint (server-authoritative aspirational copy)
 *   - bcc_attestation_bandwidth_exhausted: kind='stand_behind' only;
 *     error.data.slot_holders carries the rows to revoke from (V1
 *     returns empty array — FE shows the fallback "revoke one to
 *     free a slot" message)
 *   - bcc_attestation_self / bcc_invalid_request: hand-crafted /
 *     stale UI; render error.message verbatim
 */
export function castAttestation(
  request: AttestationCastRequest,
): Promise<AttestationCastResponse> {
  return bccFetchAsClient<AttestationCastResponse>("me/attestations", {
    method: "POST",
    body: request,
  });
}

/**
 * DELETE /me/attestations/:id — revoke (soft-delete).
 *
 * Idempotent: re-DELETE on already-revoked returns 200 with the
 * existing revoked_at (no audit row, no notification).
 *
 * Errors:
 *   - bcc_not_found  (404) — id doesn't exist
 *   - bcc_forbidden  (403) — not your attestation
 */
export function revokeAttestation(
  attestationId: number,
): Promise<AttestationRevokeResponse> {
  return bccFetchAsClient<AttestationRevokeResponse>(
    `me/attestations/${attestationId}`,
    { method: "DELETE" },
  );
}

/**
 * POST /me/attestations/:id/reaffirm — refresh decay baseline.
 *
 * Errors:
 *   - bcc_not_found             (404) — id doesn't exist
 *   - bcc_forbidden             (403) — not your attestation
 *   - bcc_attestation_revoked   (409) — cannot reaffirm a revoked row
 */
export function reaffirmAttestation(
  attestationId: number,
): Promise<AttestationReaffirmResponse> {
  return bccFetchAsClient<AttestationReaffirmResponse>(
    `me/attestations/${attestationId}/reaffirm`,
    { method: "POST" },
  );
}
